import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { corsHeaders } from '../_shared/utils.ts'

async function fetchTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  const headers = new Headers(opts.headers)
  if (!headers.has('User-Agent')) {
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    )
  }
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow', headers, ...opts })
  } finally {
    clearTimeout(id)
  }
}

type ProbeResult = { status: 'available' | 'unavailable' | 'error'; reason?: string; probe?: string }

async function probeHtmlPage(pageUrl: string, tokenId: string): Promise<ProbeResult> {
  try {
    const r = await fetchTimeout(pageUrl, { method: 'GET' }, 15000)
    if (!r) return { status: 'error', reason: 'no-response' }
    if (r.status === 404 || r.status === 410) return { status: 'unavailable', reason: '404/410' }

    const text = await r.text()
    const lowerText = text.toLowerCase()

    if (/(not found|page not found|no item|invalid token|no results|not available|doesn't exist)/i.test(lowerText)) {
      return { status: 'unavailable', probe: 'html-heuristic-negative' }
    }

    const jsonLdRegex = /<script type="application\/ld\+json">(.*?)<\/script>/gs
    let match
    while ((match = jsonLdRegex.exec(text)) !== null) {
      try {
        const jsonContent = JSON.parse(match[1])
        const str = JSON.stringify(jsonContent).toLowerCase()
        if (tokenId && str.includes(tokenId.toLowerCase())) {
          return { status: 'available', probe: 'json-ld' }
        }
      } catch {
        // ignore parse errors
      }
    }

    const titleMatch = text.match(/<title>(.*?)<\/title>/i)
    const ogTitleMatch = text.match(/<meta property="og:title" content="(.*?)"/i)
    const ogDescMatch = text.match(/<meta property="og:description" content="(.*?)"/i)
    const title = titleMatch ? titleMatch[1] : ''
    const ogTitle = ogTitleMatch ? ogTitleMatch[1] : ''
    const ogDesc = ogDescMatch ? ogDescMatch[1] : ''
    const combined = (ogTitle + ' ' + ogDesc + ' ' + title).toLowerCase()
    if (combined && (combined.includes('nft') || combined.includes('token') || combined.includes(tokenId.toLowerCase()))) {
      return { status: 'available', probe: 'meta-title' }
    }

    if (
      lowerText.includes('owner') ||
      lowerText.includes('minted') ||
      lowerText.includes('created by') ||
      lowerText.includes('collection')
    ) {
      return { status: 'available', probe: 'body-keywords' }
    }

    if (r.status >= 200 && r.status < 300) {
      return { status: 'available', probe: 'html-200-fallback' }
    }

    return { status: 'unavailable', probe: 'fallback-unavailable' }
  } catch (e) {
    return { status: 'error', reason: String(e) }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { marketplace, collection, tokenId } = await req.json()
    if (!marketplace || !collection || tokenId === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const tok = String(tokenId)
    let result: ProbeResult

    if (marketplace === 'rarible') {
      result = await probeHtmlPage(`https://rarible.com/electroneum/items/${collection}:${tok}`, tok)
    } else if (marketplace === 'electroswap') {
      result = await probeHtmlPage(`https://app.electroswap.io/nfts/asset/${collection}/${tok}`, tok)
    } else {
      result = { status: 'error', reason: 'Unknown marketplace' }
    }

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ status: 'error', reason: String(e) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
