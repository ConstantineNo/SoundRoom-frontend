import { test, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 20000 })
import { randomUUID } from 'node:crypto'
import { appendFile, writeFile } from 'node:fs/promises'

// Explicit opt-in: creates a dedicated account and private test data on the documented server.
// No tracing, video or storageState: credentials and Bearer tokens stay in memory.
test.use({ trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 20000 })
test('deployed API through the UI: private classification lifecycle', async ({ page, request }, testInfo) => {
  test.skip(process.env.SOUNDROOM_LIVE_SMOKE !== '1', 'Requires authorization for test-server writes and SOUNDROOM_LIVE_SMOKE=1.')
  test.setTimeout(360000)

  const base = 'http://163.192.34.11/api'
  const username = `frontend_${randomUUID().replaceAll('-', '').slice(0, 14)}`
  const password = randomUUID()
  const result = { started_at: new Date().toISOString(), project: testInfo.project.name, base_url: base, username, score_ids: [], checks: [], passed: false }
  const record = (check) => { result.checks.push(check); console.log(`[${testInfo.project.name}] ${check}`) }
  // Keep the combined UI + assertion traffic below the server's 60 requests/minute limit.
  let queue = Promise.resolve()
  function throttle() { queue = queue.then(() => new Promise(resolve => setTimeout(resolve, 2200))); return queue }
  const remote = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, async (...args) => { await throttle(); return request[method](...args) }]))
  await page.route('http://127.0.0.1:5173/api/**', async route => { await throttle(); await route.continue() })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  async function choose(container, selector, text) {
    const select = container.locator(selector)
    if ((await select.innerText()).includes(text)) return
    await select.scrollIntoViewIfNeeded()
    await select.click()
    await page.locator('.n-base-select-menu:visible').getByText(text, { exact: true }).click()
  }
  async function back() { await page.getByRole('button', { name: '← 返回曲谱库', exact: true }).click() }
  async function createForm(title) {
    await page.getByRole('button', { name: '＋ 快速登记' }).click()
    await page.getByPlaceholder('例如：大鱼').fill(title)
    await page.getByPlaceholder('例如 D、1=D 或 6=A').fill('D')
  }
  try {
    const registered = await remote.post(`${base}/auth/register`, { data: { username, password } })
    expect(registered.status(), 'dedicated test account registration').toBe(200)
    await page.goto('/login')
    await page.getByPlaceholder('请输入用户名').fill(username)
    await page.getByPlaceholder('请输入密码').fill(password)
    await page.locator('.n-card').getByRole('button', { name: '登录', exact: true }).click()
    await expect(page).toHaveURL(/\/library$/, { timeout: 30000 })
    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(Boolean(token)).toBe(true)
    const headers = { Authorization: `Bearer ${token}` }
    const getDetail = async (id) => {
      const response = await remote.get(`${base}/scores/${id}`, { headers })
      expect(response.status()).toBe(200)
      return { data: (await response.json()).data, etag: response.headers().etag }
    }
    record('真实注册与页面登录（urlencoded登录、裸认证响应）')

    await createForm('前端联调 · 待归类登记')
    await page.getByRole('button', { name: '先保存，稍后归类' }).click()
    await expect(page).toHaveURL(/\/scores\/\d+$/, { timeout: 30000 })
    const pendingId = Number(page.url().split('/').pop()); result.score_ids.push(pendingId)
    const pending = await getDetail(pendingId)
    expect(pending.data.visibility).toBe('private')
    expect(pending.data.assets).toHaveLength(0)
    expect(pending.data.arrangements[0].sections[0].classification_status).toBe('pending')
    await expect(page.getByRole('button', { name: '暂不可跟练' })).toBeDisabled()
    record('只填曲名/原调/指法即可建档，无附件、私有、pending、不可跟练')

    await back()
    await createForm('前端联调 · D调分段测试')
    const candidateResponse = page.waitForResponse(r => r.url().endsWith('/flute-key-candidates') && r.request().method() === 'POST')
    await page.getByRole('button', { name: '推算候选' }).click()
    const candidate = (await (await candidateResponse).json()).data
    expect(candidate.candidates.map(c => c.flute_key)).toContain('A')
    expect(candidate.range_checked).toBe(false)
    await page.getByRole('button', { name: '采用此候选' }).click()
    await page.getByRole('button', { name: '确认并登记' }).click()
    await expect(page).toHaveURL(/\/scores\/\d+$/, { timeout: 30000 })
    const id = Number(page.url().split('/').pop()); result.score_ids.push(id)
    await expect(page.locator('.section-combination')).toHaveText('A 调笛 / 筒音作2')
    const initial = await getDetail(id)
    expect(initial.data.visibility).toBe('private')
    expect(initial.data.arrangements[0].sections[0].classification_status).toBe('confirmed')
    record('D＋筒音作2候选为A，用户采用后confirmed；音域未验证')

    await page.getByRole('button', { name: '编辑方案', exact: true }).click()
    await page.getByPlaceholder('例如：常用方案').fill('联调 · A-G-A分段方案')
    await page.getByPlaceholder('全曲、开头、转调后、尾声……无需小节号').fill('开头')
    for (const [location, local, fingering, flute] of [['转调后', 'G', '筒音作5', 'G调笛'], ['尾声', 'D', '筒音作2', 'A调笛']]) {
      await page.getByRole('button', { name: '＋ 在当前方案添加演奏段（演奏中切换）' }).click()
      const section = page.locator('.section-editor').last()
      await section.getByPlaceholder('全曲、开头、转调后、尾声……无需小节号').fill(location)
      await section.getByPlaceholder('例如 1=G，不改变曲目原调').fill(local)
      await choose(section, '[aria-label="筒音指法"]', fingering)
      await choose(section, '[aria-label="人工选择笛调"]', flute)
      await section.getByRole('button', { name: '人工确认', exact: true }).click()
    }
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 })
    const ordered = await getDetail(id)
    expect(ordered.data.arrangements[0].sections.map(s => s.flute_key)).toEqual(['A', 'G', 'A'])
    expect(ordered.data.arrangements[0].sections[0].id).toBe(initial.data.arrangements[0].sections[0].id)
    await expect(page.getByText('需换笛', { exact: true })).toBeVisible()
    await expect(page.getByText('需换指法', { exact: true })).toBeVisible()
    record('页面新增演奏段并保存A→G→A顺序、指法2→5→2、原段ID与If-Match')

    await back()
    await page.getByRole('button', { name: 'A调笛 1' }).click()
    await page.getByRole('button', { name: '筒音作2 · 1' }).click()
    await expect(page.getByText(/局部段落使用/)).toBeVisible()
    await expect(page.getByText('开头、尾声', { exact: true })).toBeVisible()
    await expect(page.locator('.score-card')).toHaveCount(1)
    await page.getByText('此组合覆盖全曲', { exact: true }).click()
    await expect(page.getByRole('heading', { name: '没有符合条件的曲目' })).toBeVisible()
    await page.getByText('此组合覆盖全曲', { exact: true }).click()
    await page.getByRole('button', { name: '查看曲目 →' }).click()
    record('真实分类聚合与列表：同曲命中两段只计1首、命中段名、whole不误匹配')

    await page.getByRole('button', { name: '编辑方案', exact: true }).click()
    await page.getByPlaceholder('例如：常用方案').fill('并发冲突草稿')
    const beforeConflict = await getDetail(id)
    const patched = await remote.patch(`${base}/scores/${id}`, { headers: { ...headers, 'If-Match': beforeConflict.etag }, data: { notes: '联调模拟另一个窗口更新' } })
    expect(patched.status()).toBe(200)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('内容已在其他位置更新。请对照最新内容，再重新编辑保存。')).toBeVisible()
    await expect(page.getByPlaceholder('例如：常用方案')).toHaveValue('并发冲突草稿')
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '关闭草稿，查看最新内容' }).click()
    record('真实412：保留草稿、加载最新详情且禁止盲目覆盖')

    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16); return c.toDataURL('image/png').split(',')[1] })
    await page.locator('input[type=file]').setInputFiles({ name: 'frontend-test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
    await page.getByRole('button', { name: '上传资料', exact: true }).click()
    await page.getByRole('button', { name: '查看资料', exact: true }).click()
    await expect(page.getByAltText('曲谱图片')).toBeVisible()
    await expect.poll(() => page.getByAltText('曲谱图片').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
    const withImage = await getDetail(id)
    const assetId = withImage.data.assets[0].id
    expect((await remote.get(`${base}/scores/${id}/assets/${assetId}`)).status()).toBe(404)
    expect((await remote.get(`${base}/scores/${id}`)).status()).toBe(404)
    record('PNG真实上传和带Bearer的Blob预览；匿名读取私有曲目和资料均404')

    await choose(page.locator('.upload-form'), '.n-select >> nth=0', '机器谱 · UTF-8 ABC')
    await choose(page.locator('.upload-form'), '.n-select >> nth=1', '联调 · A-G-A分段方案')
    await page.locator('input[type=file]').setInputFiles({ name: 'frontend-test.abc', mimeType: 'text/plain', buffer: Buffer.from('X:1\nT:Frontend integration test\nM:4/4\nL:1/4\nK:D\nD E F G|A B c d|\n') })
    await page.getByRole('button', { name: '上传资料', exact: true }).click()
    await expect(page.getByText(/机器谱 #/)).toBeVisible()
    await expect(page.getByRole('button', { name: '暂不可跟练' })).toBeDisabled()
    record('UTF-8 ABC绑定指定方案并stored；仍未冒称可跟练')

    await page.getByRole('button', { name: '编辑曲目信息' }).click()
    await page.getByRole('dialog').locator('.n-input input').nth(1).fill('E')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 })
    const review = await getDetail(id)
    expect(review.data.arrangements[0].sections.map(s => s.classification_status)).toEqual(['needs_review', 'confirmed', 'confirmed'])
    expect(review.data.arrangements[0].sections[0].flute_key).toBeNull()
    record('修改原调只使依赖原调的段needs_review，独立段落调性段仍confirmed')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('live-detail.png'), fullPage: true })
    await page.getByRole('button', { name: '退出', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
    record('页面退出清除身份；桌面/手机视口无横向溢出和未捕获页面异常')
    result.passed = true
  } finally {
    result.finished_at = new Date().toISOString()
    result.browser_errors = errors
    await writeFile(testInfo.outputPath('live-result.json'), JSON.stringify(result, null, 2))
    await appendFile('.tmp/live-run-history.jsonl', JSON.stringify(result) + '\n')
    await testInfo.attach('live-result', { path: testInfo.outputPath('live-result.json'), contentType: 'application/json' })
  }
})
