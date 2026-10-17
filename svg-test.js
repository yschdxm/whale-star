const { chromium } = require("playwright-core");

(async () => {
  const url =
    "https://whale-star.whale-star.workers.dev/preview/count?repo=deepseek-ai/DeepSeek-V3";
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:#222">
      <img id="a" src="${url}" width="800" />
    </body></html>`,
    { waitUntil: "networkidle", timeout: 90000 },
  );
  // wait for the image to fully decode
  await page.waitForFunction(() => {
    const i = document.getElementById("a");
    return i && i.complete && i.naturalWidth > 0;
  }, { timeout: 90000 });
  const info = await page.evaluate(() => {
    const i = document.getElementById("a");
    return { complete: i.complete, nw: i.naturalWidth, nh: i.naturalHeight };
  });
  console.log("img info:", JSON.stringify(info));
  await page.screenshot({ path: "out/svg-img-test.png" });
  await browser.close();
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
