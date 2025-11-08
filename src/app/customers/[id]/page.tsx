import prisma from "@/lib/db";
import Link from "next/link";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { formatPhone } from "@/components/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { revalidatePath } from "next/cache";
import { DropZone, FileList, DocumentGrid, PhotoGrid } from "./UploadsClient";
import nextDynamic from "next/dynamic";
import StartMeasurementButton from '@/components/StartMeasurementButton';
import FlagPicker from '@/components/FlagPicker';
const PropertyMap = nextDynamic(() => import("@/components/PropertyMapGoogle"), { ssr: false });
const DroneScanButton = nextDynamic(() => import('./DroneScanButton'), { ssr: false });
const DroneMissionList = nextDynamic(() => import('@/components/drone/DroneMissionList'), { ssr: false });
// @ts-ignore - dynamic import typing handled by component file
import ManageContactClient from './ManageContactClient';

async function createJob(leadId: string, formData: FormData) {
  "use server";
  const price = Number(formData.get("contractPrice"));
  await prisma.lead.update({ where: { id: leadId }, data: { stage: "SOLD", contractPrice: isFinite(price) ? price : null } });
  revalidatePath(`/customers`);
}

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: { leads: { include: { property: true, assignee: true }, orderBy: { createdAt: 'desc' } } }
  });
  if (!contact) return null;
  const lead = contact.leads[0];
  const contactAssignee = lead?.assignee || null;
  // Build a normalized address string similar to existing map usage
  let normalizedAddress: string | null = null;
  if (lead?.property) {
    const p = lead.property;
    const city = p.city?.trim() || '';
    const statePostal = [p.state, p.postal].filter(Boolean).join(' ').trim();
    const lowerAddress1 = p.address1.toLowerCase();
    const parts: string[] = [p.address1];
    if (city && !lowerAddress1.includes(city.toLowerCase())) parts.push(city);
    if (statePostal && !lowerAddress1.includes((p.state||'').toLowerCase()) && !lowerAddress1.includes((p.postal||'').toLowerCase())) parts.push(statePostal);
    normalizedAddress = parts.join(', ');
  }
  const files = await prisma.file.findMany({
    where: { OR: [{ contactId: contact.id }, ...(lead ? [{ leadId: lead.id }] : [])] },
    orderBy: { createdAt: "desc" }
  });

  // Determine if this contact has an existing job appointment on any of their leads
  const existingJob = await prisma.appointment.findFirst({
    where: {
      tenantId: contact.tenantId,
      lead: { contactId: contact.id },
      OR: [
        { allDay: true },
        { title: { startsWith: 'JOB:' } },
        { jobStatus: { not: null } },
        { crewId: { not: null } },
        { squares: { gt: 0 } },
      ],
    },
    orderBy: { start: 'desc' },
    select: { id: true },
  });
  const hasJob = !!existingJob;

  // Map internal stage codes to user-friendly labels for display under the name
  const stageMap: Record<string, string> = {
    LEAD: 'Lead',
    PROSPECT: 'Prospect',
    APPROVED: 'Approved',
    COMPLETED: 'Completed',
    INVOICED: 'Invoiced',
    ARCHIVE: 'Archive',
    SOLD: 'Sold',
  };
  const statusLabel = lead?.stage ? (stageMap[lead.stage] || lead.stage.charAt(0) + lead.stage.slice(1).toLowerCase()) : '';

  // NOTE: Removed legacy reference to lead.appointments (no relation included in this query) to avoid type errors.

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pt-6 pb-4 bg-gradient-to-r from-[#0b1a2e] via-[#1773e6] to-[#60a5fa] text-white rounded-t-lg">
          <div className="flex flex-col items-center gap-4">
            <div className="w-full flex flex-col gap-2">
              <div className="w-full flex items-start justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <span>{contact.name}</span>
                  <FlagPicker contactId={contact.id} initial={contact.flagColor as any} />
                </CardTitle>
                <ManageContactClient inline contact={{ id: contact.id, name: contact.name, email: contact.email || '', phone: contact.phone || '' }} property={lead?.property ? { id: lead.property.id, address1: lead.property.address1 } : null} />
              </div>
              <div className="w-full flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-white/80">Status: {statusLabel || '—'}</div>
                  <div className="mt-1 text-xs text-white/75">
                    Assigned to: {contactAssignee ? (contactAssignee.name || contactAssignee.email || '—') : '—'}
                  </div>
                </div>
              </div>
            </div>
            {typeof lead?.contractPrice === 'number' && isFinite(lead.contractPrice) && (
              <div className="w-full">
                <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-800">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4 12 14.01l-3-3" />
                  </svg>
                  <span className="font-semibold">Approved contract price:</span>
                  <span className="tabular-nums">${lead.contractPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
  <CardContent className="p-5 grid md:grid-cols-3 gap-4 text-sm bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200">
          <div className="md:col-span-1">
            <div>Email: {contact.email ? <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a> : "—"}</div>
            <div>Phone: {contact.phone ? <a href={`tel:${normalizeTel(contact.phone)}`} className="text-blue-600 hover:underline">{formatPhone(contact.phone)}</a> : "—"}</div>
            <div>Address: {lead?.property?.address1 ?? "—"}</div>
            {/* Approved price is shown in the header banner */}
            <div className="mt-4">
              {(() => {
                const p = lead?.property;
                let address = '';
                if (p) {
                  // Normalize pieces
                  const city = p.city?.trim() || '';
                  const statePostal = [p.state, p.postal].filter(Boolean).join(' ').trim();
                  const lowerAddress1 = p.address1.toLowerCase();
                  // If address1 already includes city/state or postal, don't repeat
                  const parts: string[] = [p.address1];
                  if (city && !lowerAddress1.includes(city.toLowerCase())) parts.push(city);
                  if (statePostal && !lowerAddress1.includes((p.state||'').toLowerCase()) && !lowerAddress1.includes((p.postal||'').toLowerCase())) parts.push(statePostal);
                  address = parts.join(', ') + ', USA';
                }
                return (
                  <div>
                    <PropertyMap
                      address={address}
                      lat={p?.lat ?? null}
                      lng={p?.lng ?? null}
                      propertyId={p?.id}
                      className="relative w-full h-64 rounded-xl overflow-hidden"
                    />
                    {p && (() => {
                      const addr = address.replace(', USA','');
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
                      return (
                        <div className="mt-2">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-full h-9 px-3 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm"
                          >Navigate</a>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
              <div className="mt-3 flex items-center gap-2">
                {hasJob && (
                  <Link href="/jobs" className="inline-flex items-center justify-center w-full h-9 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
                    View Job
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-6 md:col-span-2">
            {/* Quick actions: Measure, Drone Scan, Create Proposal */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Keep Measure first */}
              <StartMeasurementButton variant="tile" leadId={lead?.id} address={normalizedAddress || undefined} />

              {/* Move Create Proposal into second slot */}
              <Link href={lead?.id ? `/proposals/create?lead=${lead.id}` : "/proposals/create"} className="group relative flex items-center gap-3 rounded-md border border-sky-300 bg-sky-100 hover:bg-sky-200 hover:border-sky-400 hover:shadow-sm transition px-4 py-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sky-500 text-white group-hover:bg-sky-600 transition">
                  {/* Signed Document Icon */}
                  <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" className="h-5 w-5">
                    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                    <path d="M14 3v6h6" />
                    <path d="M9 13h6" />
                    <path d="M9 17h3" />
                    <path d="M16.5 15.5l-1 1 2 2 3-3" />
                  </svg>
                </span>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium text-sky-900 leading-none">Create Proposal</span>
                  <span className="mt-1 text-xs text-sky-800/80">Draft or edit proposal</span>
                </div>
              </Link>

              {/* Create Material List in third slot */}
              <Link href={lead?.id ? `/materials/create?lead=${lead.id}` : "/materials/create"} className="group relative flex items-center gap-3 rounded-md border border-amber-300 bg-amber-100 hover:bg-amber-200 hover:border-amber-400 hover:shadow-sm transition px-4 py-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-500 text-white group-hover:bg-amber-600 transition">
                  {/* Checklist icon */}
                  <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" className="h-5 w-5">
                    <path d="M9 6h11" />
                    <path d="M9 12h11" />
                    <path d="M9 18h11" />
                    <path d="M4 6l1.5 1.5L7.5 5" />
                    <path d="M4 12l1.5 1.5L7.5 11" />
                    <path d="M4 18l1.5 1.5L7.5 17" />
                  </svg>
                </span>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium text-amber-900 leading-none">Create Material List</span>
                  <span className="mt-1 text-xs text-amber-800/80">Start material takeoff</span>
                </div>
              </Link>

              {/* Drone Scan moved to last (far right on lg screens) */}
              <DroneScanButton
                contactId={contact.id}
                leadId={lead?.id}
                propertyId={lead?.property?.id}
                normalizedAddress={normalizedAddress || ''}
              />
            </div>

            <div>
              <div className="font-medium mb-2">Photos</div>
              <DropZone contactId={contact.id} leadId={lead?.id || null} category="photos" folder="Photos">
                <PhotoGrid items={files.filter((f: any) => f.category === "photos")} />
              </DropZone>
              <div className="mt-4">
                <DroneMissionList contactId={contact.id} leadId={lead?.id} propertyId={lead?.property?.id} />
              </div>
            </div>
            <div>
              <div className="font-medium mb-2">Documents</div>
              <DropZone contactId={contact.id} leadId={lead?.id || null} category="documents" folder="Documents">
                <DocumentGrid items={files.filter((f: any) => f.category === "documents")} />
              </DropZone>
            </div>
            {/* End actions */}
          </div>
        </CardContent>
      </Card>

      {lead && (
        <Card>
          <CardHeader><CardTitle>Create Job</CardTitle></CardHeader>
          <CardContent>
            <form action={createJob.bind(null, lead.id)} className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500">Total Contract Price</label>
                <input name="contractPrice" type="number" step="0.01" className="h-10 rounded-md border border-slate-300 px-3" />
              </div>
              <button className="h-10 px-4 rounded-md bg-emerald-600 text-white">Create Job</button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function normalizeTel(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return digits;
}

function PhotoUpload({ contactId, leadId }: { contactId: string; leadId: string | null }) {
  return (
    <form action="/api/uploads" method="post" encType="multipart/form-data" className="flex flex-wrap gap-2 items-end">
      <input type="hidden" name="contactId" value={contactId} />
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      <input type="hidden" name="category" value="photos" />
      <input type="hidden" name="folder" value="Photos" />
      <label className="inline-flex items-center gap-2">
        <span className="px-3 py-2 rounded-md bg-slate-100 cursor-pointer">Add photos</span>
        <input name="file" type="file" accept="image/*" multiple className="hidden" />
      </label>
      <button className="h-10 px-4 rounded-md bg-emerald-600 text-white">Upload</button>
    </form>
  );
}

function DocUploads({ contactId, leadId }: { contactId: string; leadId: string | null }) {
  const folders = ["Measurements", "Proposals", "Signed contract", "Docs"] as const;
  return (
    <div className="space-y-2">
      {folders.map((folder) => (
        <form key={folder} action="/api/uploads" method="post" encType="multipart/form-data" className="flex flex-wrap gap-2 items-end">
          <input type="hidden" name="contactId" value={contactId} />
          {leadId && <input type="hidden" name="leadId" value={leadId} />}
          <input type="hidden" name="category" value="documents" />
          <input type="hidden" name="folder" value={folder} />
          <label className="inline-flex items-center gap-2">
            <span className="px-3 py-2 rounded-md bg-slate-100 cursor-pointer">Add to {folder}</span>
            <input name="file" type="file" multiple className="hidden" />
          </label>
          <button className="h-10 px-4 rounded-md bg-emerald-600 text-white">Upload</button>
        </form>
      ))}
    </div>
  );
}

// no folder grouping; "Documents" shown as a flat list
