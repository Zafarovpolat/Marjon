import { api } from "./client";

const ACTIVITY_PATHS = Object.freeze({
  attendance: "/hr/attendance",
  "login-history": "/hr/login-history",
});

export const staffService = Object.freeze({
  listStaffUsers() {
    return api.get("/auth/staff-users");
  },
  listCompanyUsers() {
    return api.get("/auth/users");
  },
  createCompanyUser(payload) {
    return api.post("/auth/users", payload);
  },
  updateCompanyUser(id, payload) {
    return api.patch(`/auth/users/${id}`, payload);
  },
  deleteCompanyUser(id) {
    return api.delete(`/auth/users/${id}`);
  },
  updateUserPin(id, pin) {
    return api.patch(`/auth/users/${id}/pin`, { pin });
  },
  listEmployees() {
    return api.get("/hr/employees");
  },
  createEmployee(payload) {
    return api.post("/hr/employees", payload);
  },
  updateEmployee(id, payload) {
    return api.patch(`/hr/employees/${id}`, payload);
  },
  deleteEmployee(id) {
    return api.delete(`/hr/employees/${id}`);
  },
  listActivity(type) {
    const path = ACTIVITY_PATHS[type];
    if (!path) throw new TypeError(`Unknown staff activity type: ${type}`);
    return api.get(path);
  },
});

export { ACTIVITY_PATHS };
