import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address') || ''
    const zoom = searchParams.get('zoom') || '20'
    const size = searchParams.get('size') || '640x240'
    const scale = searchParams.get('scale') || '2'
    const maptype = searchParams.get('maptype') || 'satellite'

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !address) {
      return new Response('Missing address or API key', { status: 400 })
    }

    const params = new URLSearchParams([
      ['center', address],
      ['zoom', zoom],
      ['size', size],
      ['maptype', maptype],
      ['scale', scale],
      ['markers', `color:red|${address}`],
      ['key', apiKey]
    ])
    const url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`

    const resp = await fetch(url)
    if (!resp.ok) {
      const txt = await resp.text().catch(()=> '')
      return new Response(txt || 'Upstream error', { status: 502 })
    }
    const ab = await resp.arrayBuffer()
    // Google returns image/png by default
    return new Response(ab, {
      status: 200,
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=300'
      }
    })
  } catch (e: any) {
    return new Response(e?.message || 'Error', { status: 500 })
  }
}
