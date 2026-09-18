import { test, expect } from '@playwright/test'

const browserErrors = new WeakMap()
test.beforeEach(({ page }) => { const errors = []; browserErrors.set(page, errors); page.on('pageerror', e => errors.push(e.message)) })
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]) })

const options = {
  flute_keys: ['D', 'G', 'A'].map(code => ({ code, label: `${code}调笛` })),
  fingerings: ['2', '5', 'b7', '7'].map(code => ({ code: `closed_${code}`, label: `筒音作${code === 'b7' ? '降7' : code}` }))
}
const capability = { available: false, status: 'not_provided', reasons: ['NOTATION_NOT_PROVIDED'] }
const section = (id, fingering = 'closed_2', flute_key = 'A') => ({ id, position: id, location_label: ['开头', '转调后', '尾声'][id - 1], fingering: { code: fingering, label: fingering === 'closed_2' ? '筒音作2' : '筒音作5' }, flute_key, key_basis: 'original', instrument_profile: 'standard_six_hole_dizi', local_key: null, performance_key: null, notes: null, classification_status: 'confirmed' })
function fixture() {
  return { id: 1, title: '大鱼', original_key: 'D', notes: '有低音3', tags: [], owner: { id: 7, username: 'tester' }, visibility: 'private', classification_incomplete: false, assets: [], arrangements: [{ id: 10, label: '常用方案', coverage: 'complete', is_default: true, notes: null, classification_complete: true, requires_flute_switch: true, requires_fingering_switch: true, sections: [section(1), section(2, 'closed_5', 'G'), section(3)], practice_capability: capability }] }
}
async function setup(page, { loggedIn = true, conflict = false, candidateStale = false, failFirstCreate = false, publicScore = false, accessDenied = false } = {}) {
  if (loggedIn) await page.addInitScript(() => { localStorage.setItem('token', 'test-token'); localStorage.setItem('username', 'tester') })
  let score = fixture(), revision = 1, creates = 0
  if (publicScore) { score.visibility = 'public'; score.owner = { id: 8, username: 'other' } }
  const requests = []
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/api', ''), method = req.method()
    let body
    try { body = req.postDataJSON() } catch { body = req.postData() }
    requests.push({ path, method, body, headers: req.headers(), query: Object.fromEntries(url.searchParams) })
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { ETag: `"${revision}"` }, body: JSON.stringify({ code: 0, message: 'ok', data }) })
    if (accessDenied && path !== '/auth/me') return route.fulfill({ status: 403, contentType: 'text/plain', body: 'Access Denied' })
    if (path === '/auth/me') return route.fulfill({ json: { id: 7, username: 'tester', role: 'user' } })
    if (path === '/score-classification-options') return send(options)
    if (path === '/score-categories') return send({ groups: [{ flute_key: 'A', label: 'A调笛', score_count: 1, fingerings: [{ code: 'closed_2', label: '筒音作2', score_count: 1 }] }], total_visible_scores: 1, classified_score_count: 1, pending_score_count: 0, review_score_count: 0 })
    if (path === '/scores/' && method === 'GET') return send({ items: url.searchParams.get('match') === 'whole' ? [] : [{ ...score, arrangements: undefined, matched_arrangements: url.searchParams.get('flute_key') ? [{ arrangement_id: 10, section_ids: [1, 3], whole_match: false, classification_complete: true, requires_flute_switch: true, requires_fingering_switch: true, required_combinations: [{ flute_key: 'A', fingering: 'closed_2' }, { flute_key: 'G', fingering: 'closed_5' }] }] : null }], total: url.searchParams.get('match') === 'whole' ? 0 : 1, page: 1, size: 12, total_pages: 1 })
    if (path === '/flute-key-candidates') return send({ outcome: 'single', candidates: [{ flute_key: 'A', label: 'A调笛', reason: '按常规六孔竹笛音级关系计算' }], assumptions: ['按原调作为本段演奏调性', '假设1=D'], warnings: ['未验证整曲音域'], candidate_token: 'candidate-proof', range_checked: false })
    if (path === '/scores/' && method === 'POST') {
      creates++
      if (failFirstCreate && creates === 1) return route.abort('connectionfailed')
      if (candidateStale) return route.fulfill({ status: 409, json: { detail: { reason: 'CANDIDATE_STALE' } } })
      score = { ...fixture(), id: 2, ...body, classification_incomplete: !body.classification_decision }
      score.arrangements = [{ ...score.arrangements[0], requires_flute_switch: false, requires_fingering_switch: false, sections: [{ ...section(1), location_label: '全曲', classification_status: body.classification_decision ? 'confirmed' : 'pending', flute_key: body.classification_decision?.flute_key || null }] }]
      return send(score, 201)
    }
    if (/^\/scores\/\d+$/.test(path) && method === 'GET') return send(score)
    if (/^\/scores\/\d+$/.test(path) && method === 'PATCH') { score = { ...score, ...body }; revision++; return send(score) }
    if (path === '/scores/1/arrangements/10' && method === 'PUT') {
      if (conflict) { score.title = '其他位置更新的标题'; revision++; return route.fulfill({ status: 412, json: { detail: { reason: 'EDIT_CONFLICT' } } }) }
      score.arrangements[0] = { ...score.arrangements[0], ...body }; revision++; return send(score.arrangements[0])
    }
    if (path === '/scores/1/arrangements' && method === 'POST') { const a = { ...body, id: 11, classification_complete: false, sections: body.sections.map((s, i) => ({ ...s, id: 20 + i, flute_key: s.classification_decision?.flute_key || null, classification_status: s.classification_decision ? 'confirmed' : 'pending' })), practice_capability: capability }; if (a.is_default) score.arrangements.forEach(x => { x.is_default = false }); score.arrangements.push(a); revision++; return send(a, 201) }
    if (/\/arrangements\/\d+$/.test(path) && method === 'DELETE') { const id = Number(path.split('/').pop()); score.arrangements = score.arrangements.filter(a => a.id !== id); if (url.searchParams.has('replacement_default_id')) score.arrangements.find(a => a.id === Number(url.searchParams.get('replacement_default_id'))).is_default = true; revision++; return send({ removed_id: id }) }
    if (path === '/scores/1/publish' || path === '/scores/1/unpublish') { score.visibility = path.endsWith('/publish') ? 'public' : 'private'; revision++; return send(score) }
    if (path === '/scores/1/copies') { score = { ...score, id: 2, visibility: 'private', owner: { id: 7, username: 'tester' } }; return send(score, 201) }
    if (path === '/scores/1/assets' && method === 'POST') { const asset = { id: 5, purpose: 'score_image', media_type: 'image/png', size: 68, processing_status: 'stored', arrangement_id: null, issues: [] }; score.assets.push(asset); revision++; return send(asset, 201) }
    if (path === '/scores/1/assets/5' && method === 'GET') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
    if (path === '/scores/1/assets/5' && method === 'DELETE') { score.assets = []; revision++; return send({ removed_id: 5 }) }
    return route.fulfill({ status: 404, json: { detail: { reason: 'NOT_FOUND' } } })
  })
  return requests
}
async function fillCreate(page) {
  await page.getByRole('button', { name: '＋ 快速登记' }).click()
  await page.getByPlaceholder('例如：大鱼').fill('大鱼新登记')
  await page.getByPlaceholder('例如 D、1=D 或 6=A').fill('D')
}

test('two-level browsing, partial scope, whole query and responsive layout', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: '找到适合这支笛的曲子' })).toBeVisible()
  await page.getByRole('button', { name: 'A调笛 1' }).click()
  await page.getByRole('button', { name: '筒音作2 · 1' }).click()
  await expect(page.getByText(/局部段落使用/)).toBeVisible()
  await expect(page.getByText('演奏时需换笛')).toBeVisible()
  await expect(page.getByText('演奏时需换指法')).toBeVisible()
  await expect(page.locator('.score-card')).toHaveCount(1)
  await page.getByText('此组合覆盖全曲', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '没有符合条件的曲目' })).toBeVisible()
  expect(requests.some(r => r.query.match === 'whole' && r.query.flute_key === 'A' && r.query.fingering === 'closed_2')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('minimal no-file registration and retry reuses idempotency key', async ({ page }) => {
  const requests = await setup(page, { failFirstCreate: true })
  await page.goto('/library'); await fillCreate(page)
  await page.getByRole('button', { name: '先保存，稍后归类' }).click()
  await expect(page.getByText('无法连接服务，请检查网络后重试。')).toBeVisible()
  await page.getByRole('button', { name: '先保存，稍后归类' }).click()
  await expect(page).toHaveURL(/\/scores\/2$/)
  const creates = requests.filter(r => r.path === '/scores/' && r.method === 'POST')
  expect(creates).toHaveLength(2)
  expect(creates[0].headers['idempotency-key']).toBe(creates[1].headers['idempotency-key'])
  expect(creates[0].body).toEqual({ title: '大鱼新登记', original_key: 'D', fingering: { code: 'closed_2' }, notes: null })
  await expect(page.getByText('未提供跟练谱', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '暂不可跟练' })).toBeDisabled()
  await expect(page.getByText('这套方案还未提供跟练谱。', { exact: true })).toBeVisible()
  await expect(page.getByText('NOTATION_NOT_PROVIDED', { exact: true })).toHaveCount(0)
})

test('candidate requires adoption and is cleared after basis changes', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/library'); await fillCreate(page)
  await page.getByRole('button', { name: '推算候选' }).click()
  await expect(page.getByText('未验证整曲音域', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '先保存，稍后归类' })).toBeVisible()
  await page.getByRole('button', { name: '采用此候选' }).click()
  await expect(page.getByRole('button', { name: '确认并登记' })).toBeVisible()
  await page.getByPlaceholder('例如 D、1=D 或 6=A').fill('G')
  await expect(page.getByRole('button', { name: '先保存，稍后归类' })).toBeVisible()
  await page.getByRole('button', { name: '先保存，稍后归类' }).click()
  await expect(page).toHaveURL(/\/scores\/2$/)
  expect(requests.find(r => r.method === 'POST' && r.path === '/scores/').body.classification_decision).toBeUndefined()
})

test('stale candidate preserves form and offers explicit recovery', async ({ page }) => {
  await setup(page, { candidateStale: true })
  await page.goto('/library'); await fillCreate(page)
  await page.getByRole('button', { name: '推算候选' }).click(); await page.getByRole('button', { name: '采用此候选' }).click()
  await page.getByRole('button', { name: '确认并登记' }).click()
  await expect(page.getByText('候选已过期或依据已变化，请重新推算，或明确选择人工确认。')).toBeVisible()
  await expect(page.getByPlaceholder('例如：大鱼')).toHaveValue('大鱼新登记')
})

test('ordered A-B-A sections preserve IDs and send aggregate If-Match', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/scores/1')
  await page.getByRole('button', { name: '编辑方案', exact: true }).click()
  await page.getByPlaceholder('例如：常用方案').fill('换笛方案')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: '换笛方案 默认方案' })).toBeVisible()
  const put = requests.find(r => r.method === 'PUT')
  expect(put.headers['if-match']).toBe('"1"')
  expect(put.body.sections.map(s => s.id)).toEqual([1, 2, 3])
  expect(put.body.sections.map(s => s.fingering.code)).toEqual(['closed_2', 'closed_5', 'closed_2'])
  expect(put.body.sections.every(s => !('classification_status' in s) && !('classification_decision' in s))).toBe(true)
  await expect(page.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
})

test('412 retains draft, refreshes latest and blocks blind overwrite', async ({ page }) => {
  const requests = await setup(page, { conflict: true })
  await page.goto('/scores/1'); await page.getByRole('button', { name: '编辑方案', exact: true }).click()
  await page.getByPlaceholder('例如：常用方案').fill('我的草稿')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('内容已在其他位置更新。请对照最新内容，再重新编辑保存。')).toBeVisible()
  await expect(page.getByPlaceholder('例如：常用方案')).toHaveValue('我的草稿')
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '关闭草稿，查看最新内容' }).click()
  await expect(page.getByRole('heading', { name: '其他位置更新的标题' })).toBeVisible()
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1)
})

test('anonymous cannot edit, private scope is not requested', async ({ page }) => {
  const requests = await setup(page, { loggedIn: false })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '＋ 快速登记' })).toHaveCount(0)
  await page.getByRole('button', { name: '查看曲目 →' }).click()
  await expect(page.getByRole('heading', { name: '演奏方案', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑方案', exact: true })).toHaveCount(0)
  expect(requests.every(r => r.query.scope !== 'mine')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('visual sample', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: '大鱼', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('library.png'), fullPage: true })
  await page.goto('/scores/1')
  await expect(page.getByRole('heading', { name: '常用方案 默认方案' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('detail.png'), fullPage: true })
})


test('alternate arrangement is distinct and deleting default requires replacement', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/scores/1')
  await page.getByRole('button', { name: '＋ 另一套方案' }).click()
  await page.getByPlaceholder('例如：常用方案').fill('另一套方案')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.arrangement-card')).toHaveCount(2)
  const created = requests.find(r => r.path === '/scores/1/arrangements' && r.method === 'POST')
  expect(created.body.sections).toHaveLength(1)
  expect(created.headers['idempotency-key']).toBeTruthy()
  expect(created.body.is_default).toBe(false)
  await page.locator('.arrangement-card').first().getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认删除' })).toBeDisabled()
  await page.getByRole('dialog').locator('.n-select').click()
  await page.locator('.n-base-select-menu').getByText('另一套方案', { exact: true }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.locator('.arrangement-card')).toHaveCount(1)
  expect(requests.find(r => r.method === 'DELETE').query.replacement_default_id).toBe('11')
  await expect(page.getByRole('heading', { name: '另一套方案 默认方案' })).toBeVisible()
})

test('new sections reorder without losing fields or leaking local keys into DTO', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/scores/1'); await page.getByRole('button', { name: '编辑方案', exact: true }).click()
  await page.getByRole('button', { name: '＋ 在当前方案添加演奏段（演奏中切换）' }).click()
  await page.getByPlaceholder('全曲、开头、转调后、尾声……无需小节号').last().fill('新转调段')
  await page.locator('.section-editor').last().getByRole('button', { name: '上移' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const sections = requests.find(r => r.method === 'PUT').body.sections
  expect(sections.map(s => s.location_label)).toEqual(['开头', '转调后', '新转调段', '尾声'])
  expect(sections[2].id).toBeUndefined()
  expect(sections[2].key_basis).toBe('local')
  expect(sections.every(s => !('_key' in s))).toBe(true)
})

test('manual classification uses an explicit confirmation', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/library'); await fillCreate(page)
  await page.getByLabel('人工选择笛调').click()
  await page.locator('.n-base-select-menu').getByText('G调笛', { exact: true }).click()
  await page.getByRole('button', { name: '人工确认', exact: true }).click()
  await page.getByRole('button', { name: '确认并登记' }).click()
  await expect(page).toHaveURL(/\/scores\/2$/)
  expect(requests.find(r => r.method === 'POST' && r.path === '/scores/').body.classification_decision).toEqual({ method: 'manual', flute_key: 'G' })
})

test('asset upload uses authentication, concurrency, blob preview and revocation', async ({ page }) => {
  const requests = await setup(page)
  await page.addInitScript(() => { window.revokedUrls = []; const revoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = url => { window.revokedUrls.push(url); revoke(url) } })
  await page.goto('/scores/1')
  await page.locator('input[type=file]').setInputFiles({ name: 'score.png', mimeType: 'image/png', buffer: Buffer.from('fixture') })
  await page.getByRole('button', { name: '上传资料', exact: true }).click()
  await page.getByRole('button', { name: '查看资料' }).click()
  await expect(page.getByAltText('曲谱图片')).toBeVisible()
  const src = await page.getByAltText('曲谱图片').getAttribute('src')
  expect(src.startsWith('blob:')).toBe(true)
  expect(requests.find(r => r.path === '/scores/1/assets/5').headers.authorization).toBe('Bearer test-token')
  const upload = requests.find(r => r.path === '/scores/1/assets' && r.method === 'POST')
  expect(upload.headers['if-match']).toBe('"1"')
  expect(upload.headers['idempotency-key']).toBeTruthy()
  await page.getByRole('button', { name: '移除', exact: true }).click()
  await page.getByRole('button', { name: '确认移除' }).click()
  await expect(page.getByAltText('曲谱图片')).toHaveCount(0)
  expect(await page.evaluate(url => window.revokedUrls.includes(url), src)).toBe(true)
})

test('public non-owner can copy privately but cannot edit', async ({ page }) => {
  const requests = await setup(page, { publicScore: true })
  await page.goto('/scores/1')
  await expect(page.getByRole('button', { name: '编辑方案', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '复制到我的曲谱' }).click()
  await expect(page).toHaveURL(/\/scores\/2$/)
  await expect(page.getByRole('button', { name: '编辑方案', exact: true })).toBeVisible()
  expect(requests.find(r => r.path.endsWith('/copies')).headers['idempotency-key']).toBeTruthy()
})

test('publish and unpublish require explicit actions and fresh ETags', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/scores/1')
  await page.getByRole('button', { name: '公开曲目', exact: true }).click()
  await expect(page.getByText(/附件仍独立私有/)).toBeVisible()
  await page.getByRole('button', { name: '确认公开' }).click()
  await page.getByRole('button', { name: '撤回公开', exact: true }).click()
  await page.getByRole('button', { name: '确认撤回' }).click()
  await expect(page.getByRole('button', { name: '公开曲目', exact: true })).toBeVisible()
  expect(requests.find(r => r.path.endsWith('/publish')).headers['if-match']).toBe('"1"')
  expect(requests.find(r => r.path.endsWith('/unpublish')).headers['if-match']).toBe('"2"')
})


test('server access restriction is not mislabeled as score ownership', async ({ page }) => {
  await setup(page, { accessDenied: true })
  await page.goto('/library')
  await expect(page.getByRole('alert').getByText('服务拒绝了访问，请稍后重试或联系管理员。')).toBeVisible()
  await expect(page.getByText('只有创建者可以修改此曲目。')).toHaveCount(0)
})
