const IMGBB_API_KEY = "f80975e82a556615b17c466496477982";

// ========== BOT CONFIGURATIONS ==========
// Each bot has its own column mapping for the shared Airtable table
const BOT_CONFIGS = {
  sapir: {
    name: "סופר ספיר",
    baseId: "appNvxRTapf0u3L2d",
    tableId: "tbl7OaVz2hbzEskUQ",
    columns: {
      confirmedMailing: "אישר_דיוור_סופר_ספיר",
      receivedLink: "קיבל_קישור_סופר_ספיר",
      branch: "סניף_סופר_ספיר",
      trigger: "trigger_sapir",
      lastRegister: "last_register_sapir",
      lastMessage: "last_message_sapir",
    },
    shared: {
      created: "Created",
      phone: "phone_number",
      name: "name",
    }
  },
  // Add more bots here with their column mappings
  // neto: { name: "נטו חיסכון", columns: { confirmedMailing: "אישר_דיוור", ... } }
};

// Current active bot (can be changed per deployment)
const ACTIVE_BOT = "sapir";

// ========== AIRTABLE CLIENT ==========
class AirtableClient {
  constructor(apiKey, baseId) {
    this.apiKey = apiKey;
    this.baseId = baseId;
    this.lastRequestTime = 0;
    this.minInterval = 210; // 5 req/sec = 200ms, adding buffer
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRateLimit(url) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await this.delay(this.minInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    return response.json();
  }

  async fetchAllRecords(tableId, fields) {
    const records = [];
    let offset = null;
    let pageCount = 0;

    // Build fields query string
    const fieldsQuery = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    do {
      let url = `https://api.airtable.com/v0/${this.baseId}/${tableId}?${fieldsQuery}&pageSize=100`;
      if (offset) {
        url += `&offset=${offset}`;
      }

      const data = await this.fetchWithRateLimit(url);
      records.push(...data.records);
      offset = data.offset;
      pageCount++;

    } while (offset);

    return { records, pageCount };
  }

  // Stream records with progress updates (for frontend polling)
  async fetchRecordsWithProgress(tableId, fields, progressCallback) {
    const records = [];
    let offset = null;
    let pageCount = 0;
    let estimatedTotal = 0;

    const fieldsQuery = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    do {
      let url = `https://api.airtable.com/v0/${this.baseId}/${tableId}?${fieldsQuery}&pageSize=100`;
      if (offset) {
        url += `&offset=${offset}`;
      }

      const data = await this.fetchWithRateLimit(url);
      records.push(...data.records);
      offset = data.offset;
      pageCount++;

      // Estimate total based on whether there's more data
      if (offset) {
        estimatedTotal = Math.max(estimatedTotal, records.length + 100);
      } else {
        estimatedTotal = records.length;
      }

      if (progressCallback) {
        progressCallback({
          current: records.length,
          estimated: estimatedTotal,
          pages: pageCount,
          done: !offset
        });
      }

    } while (offset);

    return { records, pageCount, total: records.length };
  }
}

// Helper function to add part field to branches based on region grouping
function addPartToBranches(branches) {
  // Group by region to calculate part within each region
  const regionCounters = {};

  // First pass: calculate part for each branch based on its position within its region
  const branchesWithPart = branches.map(b => {
    const region = b.region || 'ללא אזור';
    if (regionCounters[region] === undefined) {
      regionCounters[region] = 0;
    }
    const indexWithinRegion = regionCounters[region];
    regionCounters[region]++;
    const part = Math.floor(indexWithinRegion / 10) + 1;
    return { ...b, part };
  });

  return branchesWithPart;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // CORS headers
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
      }
      const response = await handleAPI(url, request, env);
      // Add CORS to all API responses
      const newHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders())) {
        newHeaders.set(k, v);
      }
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }

    // Static files served automatically by [assets] in wrangler.toml
    return env.ASSETS.fetch(request);
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function handleAPI(url, request, env) {
  const path = url.pathname.replace('/api/', '');

  try {
    // ========== GET ==========
    if (request.method === 'GET') {

      // Dashboard - all data
      if (path === 'dashboard') {
        const [branches, promos, tips, info] = await Promise.all([
          env.DB.prepare('SELECT * FROM branches').all(),
          env.DB.prepare('SELECT * FROM promos').all(),
          env.DB.prepare("SELECT text FROM content WHERE type='tips' LIMIT 1").first(),
          env.DB.prepare("SELECT text FROM content WHERE type='info' LIMIT 1").first(),
        ]);

        const today = new Date(new Date().toDateString());

        return Response.json({
          branches: branches.results.map(b => ({
            id: b.id,
            name: b.name,
            address: b.address,
            hours: {
              sunday: b.sunday,
              monday: b.monday,
              tuesday: b.tuesday,
              wednesday: b.wednesday,
              thursday: b.thursday,
              friday: b.friday,
              saturday: b.saturday,
            },
            waze: b.waze,
            groupLink: b.group_link,
            notes: b.notes,
            region: b.region || '',
            adminNotes: b.admin_notes || '',
          })),
          promos: promos.results.map(p => ({
            id: p.id,
            title: p.title,
            image: p.image,
            description: p.description,
            expiry: p.expiry,
            branches: p.branches === 'ALL' ? 'ALL' : JSON.parse(p.branches),
            isExpired: p.expiry && new Date(p.expiry) < today,
          })),
          tips: tips?.text || '',
          general: info?.text || '',
        });
      }

      // Bot: all active promos
      if (path === 'promos') {
        const today = new Date().toISOString().split('T')[0];
        const promos = await env.DB.prepare(
          'SELECT * FROM promos WHERE expiry >= ? ORDER BY expiry ASC'
        ).bind(today).all();

        if (promos.results.length === 0) {
          return Response.json({
            promos: [{
              id: 0,
              title: '',
              image: 'https://i.ibb.co/placeholder-sapir.jpg',
              description: 'כרגע אין מבצעים פעילים, אבל בקבוצה הסודית מתעדכנים כל הזמן!',
              expiry: '',
              branches: 'ALL',
            }],
          });
        }

        return Response.json({
          promos: promos.results.map(p => ({
            id: p.id,
            title: p.title,
            image: p.image,
            description: p.description,
            expiry: p.expiry,
            branches: p.branches === 'ALL' ? 'ALL' : JSON.parse(p.branches),
          })),
        });
      }

      // Bot: tips
      if (path === 'tips') {
        const tips = await env.DB.prepare("SELECT text FROM content WHERE type='tips' LIMIT 1").first();
        return Response.json({ tips: (tips?.text || '').split('\n').filter(Boolean) });
      }

      // Bot: info
      if (path === 'info') {
        const info = await env.DB.prepare("SELECT text FROM content WHERE type='info' LIMIT 1").first();
        return Response.json({ info: (info?.text || '').split('\n').filter(Boolean) });
      }

      // Bot: all branches list
      if (path === 'branches') {
        const branches = await env.DB.prepare('SELECT * FROM branches ORDER BY region, name').all();

        // Map to objects first
        const mappedBranches = branches.results.map(b => ({
          name: b.name,
          address: b.address,
          sunday: b.sunday,
          monday: b.monday,
          tuesday: b.tuesday,
          wednesday: b.wednesday,
          thursday: b.thursday,
          friday: b.friday,
          saturday_night: b.saturday,
          waze_link: b.waze,
          group_link: b.group_link,
          notes: b.notes,
          region: b.region || '',
        }));

        // Add part field
        const branchesWithPart = addPartToBranches(mappedBranches);

        return Response.json({
          branches: branchesWithPart,
        });
      }

      // Get unique region names for dropdown
      if (path === 'region-list') {
        const branches = await env.DB.prepare('SELECT DISTINCT region FROM branches WHERE region IS NOT NULL AND region != "" ORDER BY region').all();
        return Response.json({
          regions: branches.results.map(b => b.region),
        });
      }

      // Bot: all regions with their branches
      if (path === 'regions') {
        const branches = await env.DB.prepare('SELECT * FROM branches ORDER BY region, name').all();

        // Group branches by region with part calculation
        const regionMap = {};
        const regionCounters = {};

        for (const b of branches.results) {
          const region = b.region || 'ללא אזור';
          if (!regionMap[region]) {
            regionMap[region] = [];
            regionCounters[region] = 0;
          }

          const indexWithinRegion = regionCounters[region];
          regionCounters[region]++;
          const part = Math.floor(indexWithinRegion / 10) + 1;

          regionMap[region].push({
            name: b.name,
            address: b.address,
            sunday: b.sunday,
            monday: b.monday,
            tuesday: b.tuesday,
            wednesday: b.wednesday,
            thursday: b.thursday,
            friday: b.friday,
            saturday_night: b.saturday,
            waze_link: b.waze,
            group_link: b.group_link,
            notes: b.notes,
            part,
          });
        }

        // Convert to array format
        const regions = Object.entries(regionMap).map(([name, branches]) => ({
          name,
          branches,
        }));

        return Response.json({ regions });
      }

      // Bot: branch info by name
      if (path.startsWith('branch/')) {
        const branchName = decodeURIComponent(path.replace('branch/', ''));
        const branch = await env.DB.prepare('SELECT * FROM branches WHERE name=?').bind(branchName).first();
        if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
        return Response.json({
          message: {
            name: branch.name,
            address: branch.address,
            sunday: branch.sunday,
            monday: branch.monday,
            tuesday: branch.tuesday,
            wednesday: branch.wednesday,
            thursday: branch.thursday,
            friday: branch.friday,
            saturday_night: branch.saturday,
            waze_link: branch.waze,
            notes: branch.group_link,
            info: branch.notes,
            region: branch.region || '',
          },
        });
      }

      // Bot: best promo for branch
      if (path.startsWith('promo/')) {
        const branchName = decodeURIComponent(path.replace('promo/', ''));
        return await getBestPromo(env, branchName);
      }

      // ========== ANALYTICS ENDPOINTS ==========

      // Get analytics data from Airtable - with pagination to avoid subrequest limits
      // Client calls this multiple times with offset parameter until done=true
      if (path === 'analytics/data') {
        const botConfig = BOT_CONFIGS[ACTIVE_BOT];
        if (!env.AIRTABLE_API_KEY) {
          return Response.json({ error: 'Airtable API key not configured' }, { status: 500 });
        }

        const offset = url.searchParams.get('offset') || null;
        const client = new AirtableClient(env.AIRTABLE_API_KEY, botConfig.baseId);

        // Get all needed fields
        const fields = [
          ...Object.values(botConfig.columns),
          ...Object.values(botConfig.shared),
        ];

        try {
          // Fetch one page at a time (max 100 records per request)
          // This keeps us well under the 50 subrequest limit per invocation
          const fieldsQuery = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
          let apiUrl = `https://api.airtable.com/v0/${botConfig.baseId}/${botConfig.tableId}?${fieldsQuery}&pageSize=100`;
          if (offset) {
            apiUrl += `&offset=${offset}`;
          }

          const response = await fetch(apiUrl, {
            headers: {
              'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
              'Content-Type': 'application/json',
            }
          });

          if (!response.ok) {
            throw new Error(`Airtable API error: ${response.status}`);
          }

          const data = await response.json();

          // Transform records to analytics format
          const analyticsData = data.records.map(record => {
            const f = record.fields;
            return {
              id: record.id,
              phone: f[botConfig.shared.phone] || '',
              name: f[botConfig.shared.name] || '',
              created: f[botConfig.shared.created] || null,
              branch: f[botConfig.columns.branch] || '',
              confirmedMailing: !!f[botConfig.columns.confirmedMailing],
              receivedLink: !!f[botConfig.columns.receivedLink],
              trigger: f[botConfig.columns.trigger] || '',
              lastRegister: f[botConfig.columns.lastRegister] || null,
              lastMessage: f[botConfig.columns.lastMessage] || null,
            };
          });

          // Filter only users that have interacted with this bot
          const botUsers = analyticsData.filter(user =>
            user.branch ||
            user.confirmedMailing ||
            user.receivedLink ||
            user.trigger ||
            user.lastRegister ||
            user.lastMessage
          );

          return Response.json({
            success: true,
            botName: botConfig.name,
            data: botUsers,
            meta: {
              pageRecords: data.records.length,
              botUsersInPage: botUsers.length,
              nextOffset: data.offset || null,
              done: !data.offset,
              fetchedAt: new Date().toISOString(),
            }
          });

        } catch (error) {
          return Response.json({
            error: error.message,
            details: 'Failed to fetch data from Airtable'
          }, { status: 500 });
        }
      }
    }

    // ========== POST ==========
    if (request.method === 'POST') {
      const body = await request.json();

      // Add new branch
      if (path === 'branch/new') {
        const result = await env.DB.prepare(`
          INSERT INTO branches (name, address, sunday, monday, tuesday, wednesday,
              thursday, friday, saturday, waze, group_link, notes, region, admin_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          body.name, body.address,
          body.hours.sunday || '', body.hours.monday || '', body.hours.tuesday || '',
          body.hours.wednesday || '', body.hours.thursday || '', body.hours.friday || '',
          body.hours.saturday || '', body.waze || '', body.groupLink || '', body.notes || '',
          body.region || '', body.adminNotes || ''
        ).run();

        return Response.json({ success: true, id: result.meta.last_row_id });
      }

      // Save branch
      if (path === 'branch') {
        await env.DB.prepare(`
          UPDATE branches
          SET name=?, address=?, sunday=?, monday=?, tuesday=?, wednesday=?,
              thursday=?, friday=?, saturday=?, waze=?, group_link=?, notes=?,
              region=?, admin_notes=?
          WHERE id=?
        `).bind(
          body.name, body.address,
          body.hours.sunday, body.hours.monday, body.hours.tuesday,
          body.hours.wednesday, body.hours.thursday, body.hours.friday,
          body.hours.saturday, body.waze, body.groupLink, body.notes,
          body.region || '', body.adminNotes || '',
          body.id
        ).run();

        return Response.json({ success: true });
      }

      // Save promo (create or update)
      if (path === 'promo') {
        let imageUrl = body.image || '';

        // Upload base64 image to ImgBB
        if (imageUrl.startsWith('data:image')) {
          imageUrl = await uploadToImgBB(imageUrl, body.fileName);
        }

        const branchesVal = body.branches === 'ALL' ? 'ALL' : JSON.stringify(body.branches);

        if (body.id) {
          await env.DB.prepare(`
            UPDATE promos SET title=?, image=?, description=?, expiry=?, branches=? WHERE id=?
          `).bind(body.title, imageUrl, body.description, body.expiry, branchesVal, body.id).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO promos (title, image, description, expiry, branches) VALUES (?, ?, ?, ?, ?)
          `).bind(body.title, imageUrl, body.description, body.expiry, branchesVal).run();
        }

        return Response.json({ success: true });
      }

      // Save text content (tips / info)
      if (path === 'content') {
        const existing = await env.DB.prepare('SELECT id FROM content WHERE type=?').bind(body.type).first();

        if (existing) {
          await env.DB.prepare('UPDATE content SET text=? WHERE type=?').bind(body.text, body.type).run();
        } else {
          await env.DB.prepare('INSERT INTO content (type, text) VALUES (?, ?)').bind(body.type, body.text).run();
        }

        return Response.json({ success: true });
      }
    }

    // ========== DELETE ==========
    if (request.method === 'DELETE') {
      // Delete promo
      if (path.startsWith('promo/')) {
        const id = parseInt(path.replace('promo/', ''));
        await env.DB.prepare('DELETE FROM promos WHERE id=?').bind(id).run();
        return Response.json({ success: true });
      }

      // Delete branch
      if (path.startsWith('branch/')) {
        const id = parseInt(path.replace('branch/', ''));
        await env.DB.prepare('DELETE FROM branches WHERE id=?').bind(id).run();
        return Response.json({ success: true });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function getBestPromo(env, branchName) {
  const today = new Date().toISOString().split('T')[0];
  const promos = await env.DB.prepare(
    'SELECT * FROM promos WHERE expiry >= ? ORDER BY expiry ASC'
  ).bind(today).all();

  let specific = null;
  let global = null;

  for (const p of promos.results) {
    if (p.branches === 'ALL') {
      if (!global) global = p;
    } else {
      try {
        const list = JSON.parse(p.branches);
        if (Array.isArray(list) && list.includes(branchName) && !specific) {
          specific = p;
        }
      } catch (e) {}
    }
  }

  const winner = specific || global;
  if (winner) {
    return Response.json({
      title: winner.title,
      image: winner.image,
      description: winner.description,
      expiry: winner.expiry,
      branches: winner.branches === 'ALL' ? 'ALL' : JSON.parse(winner.branches),
    });
  }

  return Response.json({
    title: '',
    image: 'https://i.ibb.co/placeholder-sapir.jpg',
    description: 'כרגע אין מבצעים ספציפיים בסניף זה, אבל בקבוצה הסודית מתעדכנים כל הזמן!',
    expiry: '',
    branches: 'ALL',
  });
}

async function uploadToImgBB(base64String, filename) {
  const cleanBase64 = base64String.split(',')[1] || base64String;

  const formData = new FormData();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', cleanBase64);
  formData.append('name', filename || 'promo_image');

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData,
  });

  const json = await response.json();
  if (json.data && json.data.url) return json.data.url;
  throw new Error('ImgBB upload failed');
}
