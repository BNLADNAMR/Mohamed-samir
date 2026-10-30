# Security Specification — Shift Tracker RBAC & Zero-Trust Architecture

## 1. Data Invariants & Access Boundaries

1. **Closed Registration Invariant**: No uninvited user can self-register into `/users/{userId}`. Only the bootstrapped Super Admin (`aladdinamrr@gmail.com` with `email_verified == true`) or a user with a matching active/pending invitation in `/preprovisionedUsers/{emailKey}` created by an active `super_admin` can claim their `/users/{userId}` document, and ONLY with the exact role, teamId, and employeeId pre-assigned by the Super Admin.
2. **Active Account Gate**: Every read or write across `/employees`, `/teams`, `/attendance`, `/requests`, `/auditLogs`, and `/securitySettings` requires an authenticated user whose `/users/$(request.auth.uid)` profile exists and has `status == 'active'`. Disabled or pending accounts are immediately blocked at the database layer.
3. **Self-Privilege Escalation Prohibition**: No user (even when updating their own profile) may modify `role`, `extraPermissions`, `revokedPermissions`, `employeeId`, `teamId`, or `status`. Only an active `super_admin` may update RBAC attributes, and a `super_admin` cannot demote or disable their own account to prevent locking out the last active Super Admin.
4. **Delivery Representative Isolation**: A `delivery_rep` can ONLY read their own `/employees/{employeeId}` document (where `employeeId == userDoc.employeeId`) and list/get `/attendance` or `/requests` documents where `resource.data.employeeId == userDoc.employeeId` (or `submittedBy == request.auth.uid`). They can NEVER write to `/attendance` or `/employees`.
5. **Supervisor Team Boundary**: A `supervisor` can ONLY read/list `/employees`, `/attendance`, and `/requests` belonging to their assigned `teamId` (`resource.data.teamId == userDoc.teamId`), cannot create/delete employees or users, and cannot self-approve attendance corrections they submitted (`submittedBy != request.auth.uid`).
6. **Operations Manager Operational Scope**: An `operations_manager` can view/manage operational data (`employees`, `teams`, `attendance`, `requests`) and read operational `auditLogs` (`category == 'operational'`), but CANNOT create/modify `users`, CANNOT create a `super_admin`, and CANNOT modify `securitySettings`.
7. **Viewer Read-Only Gate**: A `viewer` has zero write permissions (`create`, `update`, `delete` are strictly false across all collections).
8. **Immutable Audit Trail**: `/auditLogs/{logId}` allows `create` with server timestamp (`request.time`) and `actorUserId == request.auth.uid`, and strictly forbids `update` and `delete` (`if false`) for ALL roles including Super Admin.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Self-Assigned Super Admin on Signup)**: Authenticated uninvited user writes `/users/attacker_uid` with `{ role: "super_admin", status: "active" }` → `PERMISSION_DENIED`.
2. **Payload 2 (Shadow Field Injection)**: Authenticated `super_admin` updates `/employees/EMP001` adding ghost key `{ isBypassed: true }` → `PERMISSION_DENIED` (`hasOnly` schema rejection).
3. **Payload 3 (Unverified Admin Email Spoof)**: Attacker with `email: "aladdinamrr@gmail.com"` and `email_verified: false` attempts to bootstrap `/users/spoof_uid` → `PERMISSION_DENIED`.
4. **Payload 4 (Delivery Rep Cross-Employee Snooping)**: `delivery_rep` (`employeeId: "EMP001"`) queries `/attendance/EMP002_2026-10-01` → `PERMISSION_DENIED`.
5. **Payload 5 (Delivery Rep Direct Attendance Tampering)**: `delivery_rep` attempts `update` on `/attendance/EMP001_2026-10-01` to set `attendance: "worked"` → `PERMISSION_DENIED`.
6. **Payload 6 (Supervisor Cross-Team Access)**: `supervisor` (`teamId: "TEAM_A"`) attempts to read or record attendance for employee in `TEAM_B` → `PERMISSION_DENIED`.
7. **Payload 7 (Supervisor Self-Escalation)**: `supervisor` updates own `/users/sup_uid` setting `role: "operations_manager"` → `PERMISSION_DENIED`.
8. **Payload 8 (Operations Manager Creating Super Admin)**: `operations_manager` writes `/preprovisionedUsers/new_admin` with `role: "super_admin"` → `PERMISSION_DENIED`.
9. **Payload 9 (Viewer Mutation Attempt)**: `viewer` attempts to update `/Attendance` or create `/employees` → `PERMISSION_DENIED`.
10. **Payload 10 (Disabled Account Access)**: User with `status: "disabled"` attempts to read own `/employees/EMP001` or create a `/requests` doc → `PERMISSION_DENIED`.
11. **Payload 11 (Audit Log Deletion / Tampering)**: `super_admin` attempts `delete` or `update` on `/auditLogs/log_123` → `PERMISSION_DENIED`.
12. **Payload 12 (Denial-of-Wallet Oversized String / Forged Timestamp)**: User creates `/requests/req_1` with a 50KB `description` or forged `createdAt` != `request.time` → `PERMISSION_DENIED`.
