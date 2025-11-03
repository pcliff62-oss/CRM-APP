import prisma from '@/lib/db';
import { NextRequest } from 'next/server';

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, email, phone, organization } = body;
  if (!id || !name) {
    return new Response('Missing id or name', { status: 400 });
  }
  const updated = await prisma.contact.update({ where: { id }, data: { name, email, phone, organization } });
  return Response.json(updated);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });
  // cascade considerations: remove related leads? For now just delete; foreign keys are optional.
  await prisma.contact.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
