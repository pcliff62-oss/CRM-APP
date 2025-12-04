export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Page Not Found</h1>
        <p className="text-slate-600 text-sm">The page you were looking for does not exist or has been moved.</p>
        <a href="/" className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Go Home</a>
      </div>
    </div>
  );
}
