import axiosInstance from "./axiosInstance";

class AdminService {
  async loginAdmin(email, password) {
    return axiosInstance.post("/admin/login", { email, password });
  }

  async verifyAdminOtp(email, otp) {
    return axiosInstance.post("/admin/verify-otp", { email, otp });
  }

  async logoutAdmin() {
    return axiosInstance.post("/admin/logout");
  }

  async getCurrentAdmin() {
    return axiosInstance.get("/admin/current");
  }

  async requestPasswordChange(oldPassword) {
    return axiosInstance.post("/admin/request-password-change", {
      oldPassword,
    });
  }

  async changeAdminPassword(otp, newPassword) {
    return axiosInstance.post("/admin/change-password", {
      otp,
      newPassword,
    });
  }

  async getSessions() {
    return axiosInstance.get("/admin/sessions");
  }

  async killSession(sessionId) {
    return axiosInstance.delete(`/admin/sessions/${sessionId}`);
  }

  async updateAdminProfile(name, email) {
    return axiosInstance.patch("/admin/update-profile", { name, email });
  }

  async updateAdminAvatar(formData) {
    return axiosInstance.patch("/admin/avatar", formData);
  }

  async updateProfile(formData) {
    return axiosInstance.patch("/admin/profile", formData);
  }

  async getBlocklist(params = {}) {
    return axiosInstance.get("/admin/blocklist", { params });
  }

  async getBlocklistStats() {
    return axiosInstance.get("/admin/blocklist/stats");
  }

  async addBlockedEmail(data) {
    return axiosInstance.post("/admin/blocklist", data);
  }

  async removeBlockedEmail(id) {
    return axiosInstance.delete(`/admin/blocklist/${id}`);
  }

  async getBackgroundJobs(params = {}) {
    return axiosInstance.get("/admin/jobs", { params });
  }

  async getJobStats() {
    return axiosInstance.get("/admin/jobs/stats");
  }

  async retryJob(id) {
    return axiosInstance.post(`/admin/jobs/${id}/retry`);
  }

  async deleteJob(id) {
    return axiosInstance.delete(`/admin/jobs/${id}`);
  }

  async clearCompletedJobs() {
    return axiosInstance.delete("/admin/jobs/clear-completed");
  }

  async exportJobLogs(params = {}) {
    return axiosInstance.get("/admin/jobs/export", {
      params,
      responseType: "blob",
    });
  }

  async getAnnouncementsHistory(params = {}) {
    return axiosInstance.get("/admin/announcements-history", { params });
  }

  async getActivityLogs(params = {}) {
    return axiosInstance.get("/admin/logs/activity", { params });
  }

  async getAccessLogs(params = {}) {
    return axiosInstance.get("/admin/logs/access", { params });
  }

  async clearActivityLogs() {
    return axiosInstance.delete("/admin/logs/activity");
  }

  async clearAccessLogs() {
    return axiosInstance.delete("/admin/logs/access");
  }

  // Super Admin - Admin Management APIs
  async getAdmins() {
    return axiosInstance.get("/superAdmin/admins");
  }

  async createAdmin(data) {
    return axiosInstance.post("/superAdmin/admins", data);
  }

  async updateAdmin(id, data) {
    return axiosInstance.patch(`/superAdmin/admins/${id}`, data);
  }

  async deleteAdmin(id) {
    return axiosInstance.delete(`/superAdmin/admins/${id}`);
  }
}

export const adminService = new AdminService();
export default AdminService;
