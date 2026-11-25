import { test as base, expect } from "@playwright/test";
import { HomePage } from "./pages/HomePage";
import { ProductPage } from "./pages/ProductPage";
import { SearchPage } from "./pages/SearchPage";

type Fixtures = {
  home: HomePage;
  product: ProductPage;
  search: SearchPage;
};

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    const extra = process.env.PH_E2E_EXTRA_HEADERS;
    if (extra) await page.setExtraHTTPHeaders(JSON.parse(extra) as Record<string, string>);
    // Dismiss cookie/consent banners whenever they appear, without racing them.
    await page.addLocatorHandler(page.getByRole("button", { name: /^(accept|accept all|got it)$/i }), (btn) =>
      btn.click(),
    );
    await use(page);
  },
  home: async ({ page }, use) => use(new HomePage(page)),
  product: async ({ page }, use) => use(new ProductPage(page)),
  search: async ({ page }, use) => use(new SearchPage(page)),
});

export { expect };
export { visit } from "./navigation";
