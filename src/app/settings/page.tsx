import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CrewsManager from './CrewsManager'
import dynamic from 'next/dynamic';
import CompanyInfoForm from './CompanyInfoForm';
import { getCurrentUser } from '@/lib/auth';
import { Role } from '@prisma/client';
const UsersManager = dynamic(() => import('./UsersManager'), { ssr: false });
const SalesManager = dynamic(() => import('./SalesManager'), { ssr: false });

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === Role.ADMIN;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Company Info */}
    <Card>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Company Info</CardTitle>
        </CardHeader>
        <CardContent>
      <div className="text-slate-500 text-sm mb-4">Configure company name, logo, address, and contact details.</div>
      <CompanyInfoForm isAdmin={!!isAdmin} />
        </CardContent>
      </Card>

      {/* Products & Services */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Products & Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-slate-500 text-sm">Define catalog items, pricing, and service categories.</div>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Users</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="text-slate-500 text-sm">Manage user accounts, roles, and access.</div>
            <UsersManager />
        </CardContent>
      </Card>

      {/* Crews Manager */}
      <Card className="lg:col-span-2">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Crews</CardTitle>
        </CardHeader>
        <CardContent>
          <CrewsManager />
        </CardContent>
      </Card>

      {/* Sales Manager */}
      <Card className="lg:col-span-2">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-xl">
          <CardTitle className="text-white">Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesManager />
        </CardContent>
      </Card>
    </div>
  );
}
