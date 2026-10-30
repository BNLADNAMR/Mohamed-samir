import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * التحقق من أن عنوان المزامنة الخارجي عام وآمن عبر HTTPS فقط لمنع ثغرات SSRF
 */
function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  // فحص حالة طبقة الحماية الخلفية
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      securityLayer: 'rbac-firestore-enforced',
      externalTokenConfigured: Boolean(process.env.EXTERNAL_SHIFTS_API_TOKEN),
      timestamp: new Date().toISOString(),
    });
  });

  // نقطة مزامنة خلفية آمنة تحمي مفاتيح API السرية في الخادم ولا تكشفها للمتصفح أبداً
  app.post('/api/external-sync', async (req: Request, res: Response) => {
    try {
      const { endpointUrl, actorRole, actorStatus } = req.body || {};

      if (actorStatus !== 'active') {
        res.status(403).json({
          error: 'الحساب غير نشط أو غير مصرح له بتنفيذ المزامنة الخارجية.',
        });
        return;
      }

      if (actorRole !== 'super_admin' && actorRole !== 'operations_manager') {
        res.status(403).json({
          error: 'ليس لديك صلاحية تنفيذ مزامنة الشفتات الخارجية (مقصورة على الإدارة).',
        });
        return;
      }

      const targetUrl = String(
        endpointUrl || process.env.EXTERNAL_SHIFTS_API_URL || ''
      ).trim();

      if (!targetUrl) {
        res.status(400).json({
          error: 'لم يتم تحديد رابط نقطة بيانات الشفتات الخارجية.',
        });
        return;
      }

      if (!isSafeExternalUrl(targetUrl)) {
        res.status(400).json({
          error: 'يجب أن يكون رابط النظام الخارجي آمناً ببروتوكول HTTPS وعاماً.',
        });
        return;
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      // حقن مفتاح المصادقة السري من بيئة الخادم فقط دون ظهوره في الواجهة الأمامية
      if (process.env.EXTERNAL_SHIFTS_API_TOKEN) {
        headers.Authorization = `Bearer ${process.env.EXTERNAL_SHIFTS_API_TOKEN}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const upstream = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        res.status(502).json({
          error: `استجاب النظام الخارجي برمز خطأ HTTP ${upstream.status}`,
        });
        return;
      }

      const rawData = (await upstream.json()) as {
        employees?: Record<string, unknown>[];
        attendanceRecords?: Record<string, Record<string, unknown>>;
      };

      if (!Array.isArray(rawData.employees)) {
        res.status(422).json({
          error: 'البيانات المستلمة من النظام الخارجي لا تحتوي على مصفوفة employees صالحة.',
        });
        return;
      }

      let failedCount = 0;
      const sanitizedEmployees = rawData.employees
        .map((emp, idx) => {
          const code = String(emp.employeeCode || emp.id || '').trim();
          const name = String(emp.fullName || emp.name || '').trim();
          if (!code || !name) {
            failedCount++;
            return null;
          }
          return {
            id: String(emp.id || code).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
            employeeCode: code.slice(0, 64),
            fullName: name.slice(0, 120),
            phone: String(emp.phone || '').slice(0, 32),
            hireDate: String(emp.hireDate || '2025-01-01').slice(0, 20),
            status: emp.status === 'suspended' ? 'suspended' : 'active',
            externalId: String(emp.externalId || `EXT_${code}_${idx}`).slice(0, 128),
            teamId: String(emp.teamId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
            userId: String(emp.userId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
            notes: String(emp.notes || 'مستورد من النظام الخارجي').slice(0, 500),
          };
        })
        .filter(Boolean);

      const sanitizedAttendance: Record<string, unknown> = {};
      if (rawData.attendanceRecords && typeof rawData.attendanceRecords === 'object') {
        for (const [k, rec] of Object.entries(rawData.attendanceRecords)) {
          if (!rec || typeof rec !== 'object') {
            failedCount++;
            continue;
          }
          const empId = String(rec.employeeId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const date = String(rec.date || '').slice(0, 10);
          if (!empId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            failedCount++;
            continue;
          }
          sanitizedAttendance[k] = {
            ...rec,
            employeeId: empId,
            date,
            source: 'external_sync',
          };
        }
      }

      res.json({
        employees: sanitizedEmployees,
        attendanceRecords: sanitizedAttendance,
        stats: {
          importedEmployees: sanitizedEmployees.length,
          importedAttendance: Object.keys(sanitizedAttendance).length,
          failedCount,
          syncedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? `تعذر إتمام المزامنة عبر الخادم: ${err.message}`
            : 'خطأ غير متوقع أثناء الاتصال بالنظام الخارجي.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shift Tracker RBAC Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
