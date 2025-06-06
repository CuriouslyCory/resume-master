import { ProfileDashboard } from "./_components/profile-dashboard";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Professional Profile
        </h1>
        <p className="mt-2 text-gray-600">
          Manage your career information and track your profile completion.
        </p>
      </div>

      <ProfileDashboard />
    </div>
  );
}
