export const Permissions = {
  USERS_VIEW: "USERS_VIEW",
  USERS_CREATE: "USERS_CREATE",
  USERS_UPDATE: "USERS_UPDATE",
  USERS_DELETE: "USERS_DELETE",

  ADMINS_VIEW: "ADMINS_VIEW",
  ADMINS_CREATE: "ADMINS_CREATE",
  ADMINS_UPDATE: "ADMINS_UPDATE",
  ADMINS_DELETE: "ADMINS_DELETE",

  TEAMS_VIEW: "TEAMS_VIEW",
  TEAMS_CREATE: "TEAMS_CREATE",
  TEAMS_UPDATE: "TEAMS_UPDATE",
  TEAMS_DELETE: "TEAMS_DELETE",

  CUSTOMERS_VIEW: "CUSTOMERS_VIEW",
  CUSTOMERS_CREATE: "CUSTOMERS_CREATE",
  CUSTOMERS_UPDATE: "CUSTOMERS_UPDATE",
  CUSTOMERS_DELETE: "CUSTOMERS_DELETE",

  PRODUCTS_VIEW: "PRODUCTS_VIEW",
  PRODUCTS_CREATE: "PRODUCTS_CREATE",
  PRODUCTS_UPDATE: "PRODUCTS_UPDATE",
  PRODUCTS_DELETE: "PRODUCTS_DELETE",

  INVOICES_VIEW: "INVOICES_VIEW",
  INVOICES_CREATE: "INVOICES_CREATE",
  INVOICES_UPDATE: "INVOICES_UPDATE",
  INVOICES_DELETE: "INVOICES_DELETE",
  INVOICES_SEND: "INVOICES_SEND",

  QUOTES_VIEW: "QUOTES_VIEW",
  QUOTES_CREATE: "QUOTES_CREATE",
  QUOTES_UPDATE: "QUOTES_UPDATE",
  QUOTES_DELETE: "QUOTES_DELETE",

  PAYMENTS_VIEW: "PAYMENTS_VIEW",
  PAYMENTS_CREATE: "PAYMENTS_CREATE",
  PAYMENTS_UPDATE: "PAYMENTS_UPDATE",

  EXPENSES_VIEW: "EXPENSES_VIEW",
  EXPENSES_CREATE: "EXPENSES_CREATE",
  EXPENSES_UPDATE: "EXPENSES_UPDATE",
  EXPENSES_DELETE: "EXPENSES_DELETE",

  REPORTS_VIEW: "REPORTS_VIEW",

  SETTINGS_VIEW: "SETTINGS_VIEW",
  SETTINGS_UPDATE: "SETTINGS_UPDATE",

  AUDIT_LOG_VIEW: "AUDIT_LOG_VIEW",
} as const;

export type PermissionCode = (typeof Permissions)[keyof typeof Permissions];

export const ALL_PERMISSION_CODES = Object.values(Permissions);

export const UserRoles = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

export type UserRoleName = (typeof UserRoles)[keyof typeof UserRoles];

const ADMIN_ALLOWED: ReadonlySet<PermissionCode> = new Set([
  Permissions.USERS_VIEW,
  Permissions.USERS_CREATE,
  Permissions.USERS_UPDATE,
  Permissions.USERS_DELETE,
  Permissions.INVOICES_VIEW,
  Permissions.REPORTS_VIEW,
  Permissions.SETTINGS_VIEW,
  Permissions.SETTINGS_UPDATE,
]);

const MEMBER_ALLOWED: ReadonlySet<PermissionCode> = new Set([
  Permissions.USERS_VIEW,
  Permissions.CUSTOMERS_VIEW,
  Permissions.CUSTOMERS_CREATE,
  Permissions.CUSTOMERS_UPDATE,
  Permissions.PRODUCTS_VIEW,
  Permissions.PRODUCTS_CREATE,
  Permissions.PRODUCTS_UPDATE,
  Permissions.INVOICES_VIEW,
  Permissions.INVOICES_CREATE,
  Permissions.INVOICES_UPDATE,
  Permissions.INVOICES_SEND,
  Permissions.QUOTES_VIEW,
  Permissions.QUOTES_CREATE,
  Permissions.QUOTES_UPDATE,
  Permissions.PAYMENTS_VIEW,
  Permissions.PAYMENTS_CREATE,
  Permissions.EXPENSES_VIEW,
  Permissions.EXPENSES_CREATE,
  Permissions.EXPENSES_UPDATE,
  Permissions.REPORTS_VIEW,
  Permissions.SETTINGS_VIEW,
]);

const SUPER_ADMIN_DENIED: ReadonlySet<PermissionCode> = new Set([
  Permissions.USERS_CREATE,
]);

export const ROLE_PERMISSIONS: Record<UserRoleName, PermissionCode[]> = {
  SUPER_ADMIN: ALL_PERMISSION_CODES.filter((code) => !SUPER_ADMIN_DENIED.has(code)),
  ADMIN: ALL_PERMISSION_CODES.filter((code) => ADMIN_ALLOWED.has(code)),
  MEMBER: ALL_PERMISSION_CODES.filter((code) => MEMBER_ALLOWED.has(code)),
};

export function getRolePermissions(role: UserRoleName): PermissionCode[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: UserRoleName, permission: PermissionCode): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
