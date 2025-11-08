import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

function CrewRequests() {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-lg">Crews</div>
      <p className="text-sm text-slate-600">Payment requests created when crews mark jobs complete will appear here. (Placeholder – integrate once job completion flow writes pricing.)</p>
      <div className="border rounded-md p-3 bg-white shadow-sm text-sm">No crew payment requests yet.</div>
    </div>
  )
}

function SalesPayroll() {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-lg">Sales</div>
      <p className="text-sm text-slate-600">Upcoming: commission tracking.</p>
      <div className="border rounded-md p-3 bg-white shadow-sm text-sm">Not implemented.</div>
    </div>
  )
}

function EmployeePayroll() {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-lg">Employees</div>
      <p className="text-sm text-slate-600">Upcoming: hourly & salary calculations.</p>
      <div className="border rounded-md p-3 bg-white shadow-sm text-sm">Not implemented.</div>
    </div>
  )
}

export default function PayrollPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Payroll</h1>
      <Suspense fallback={<div>Loading…</div>}>
        <div className="grid gap-8 md:grid-cols-3">
          <CrewRequests />
          <SalesPayroll />
          <EmployeePayroll />
        </div>
      </Suspense>
    </div>
  )
}
