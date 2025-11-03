import prisma from '@/lib/db';
import { NextRequest } from 'next/server';

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, address1 } = body;
  if (!id || !address1) return new Response('Missing id or address', { status: 400 });
  const updated = await prisma.property.update({ where: { id }, data: { address1 } });
  return Response.json(updated);
}
