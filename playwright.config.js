// Tes otomatis alur utama di WebKit + profil iPad (CLAUDE.md › Testing).
//
// Server menayangkan ROOT repo, sehingga app dibuka di http://localhost:4173/docs/ —
// meniru sub-path GitHub Pages (https://<user>.github.io/<repo>/). Path absolut akan gagal di sini.
//
//   npx playwright install webkit          # sekali saja (di Ubuntu/WSL: npx playwright install --with-deps webkit)
//   npm run test:webkit                    # WebKit iPad portrait + landscape
//   npm test                               # semua project, termasuk cadangan Chromium
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;
// iPad Air 11" (M4): viewport CSS 820 x 1180. Profil Playwright terdekat: "iPad Pro 11".
const ipadPortrait = { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } };
const ipadLandscape = { ...devices['iPad Pro 11 landscape'], viewport: { width: 1180, height: 820 } };

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/docs/`,
    trace: 'off',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/docs/index.html`,
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore', // log akses http.server terlalu ramai
  },
  projects: [
    { name: 'webkit-ipad', use: { ...ipadPortrait, browserName: 'webkit' } },
    { name: 'webkit-ipad-landscape', use: { ...ipadLandscape, browserName: 'webkit' } },
    // Cadangan bila WebKit tidak bisa diunduh (mis. jaringan cloud session dibatasi).
    // BUKAN pengganti WebKit: Safari tetap harus dicek di project webkit / iPad asli.
    { name: 'chromium-ipad-fallback', use: { ...ipadPortrait, browserName: 'chromium' } },
  ],
});
