import { expect, test, visit } from "./fixtures";
import { PRODUCT_LINK } from "./pages/HomePage";

/**
 * Critical anonymous discovery journeys. Live data changes constantly, so we
 * assert structure and navigation invariants, never specific product names.
 */
test.describe("Discovery journeys @smoke", () => {
  test("home page renders today's leaderboard with products", async ({ page, home }) => {
    await home.open();

    await expect(page).toHaveTitle(/Product Hunt/i);
    // Web-first assertion: retries until the leaderboard hydrates, no fixed sleeps.
    await expect.poll(() => home.productLinks.count()).toBeGreaterThanOrEqual(5);
  });

  test("opening a product from the leaderboard lands on its detail page", async ({ page, home, product }) => {
    await home.open();
    const { link, name, slug } = await home.firstProduct();

    await link.click();

    await expect(page).toHaveURL(new RegExp(`/products/${slug}`));
    await expect(product.heading).toContainText(name, { ignoreCase: true });
  });

  test("search returns relevant products and a result opens its product page", async ({ page, search }) => {
    await search.open("notion");

    await expect(search.searchBox).toHaveValue("notion");
    const top = search.result(/^Notion\b/).first();
    await expect(top).toBeVisible();

    await top.click();

    await expect(page).toHaveURL(/\/products\/notion/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(/notion/i);
  });

  test("topic page lists products for that topic", async ({ page }) => {
    await visit(page, "/topics/artificial-intelligence");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/artificial intelligence/i);
    await expect.poll(() => page.getByRole("main").locator(PRODUCT_LINK).count()).toBeGreaterThan(0);
  });

  test("historical daily leaderboard is browsable", async ({ page }) => {
    // A fixed past date: its contents are settled, so the page must always be populated.
    await visit(page, "/leaderboard/daily/2024/3/1");

    await expect(page).toHaveURL(/\/leaderboard\/daily\/2024\/3\/1/);
    await expect.poll(() => page.getByRole("main").locator(PRODUCT_LINK).count()).toBeGreaterThanOrEqual(5);
  });
});
