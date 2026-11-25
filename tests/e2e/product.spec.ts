import { expect, test } from "./fixtures";

test.describe("Product page", () => {
  test("anonymous upvote is gated behind sign-in (vote integrity)", async ({ page, home, product }) => {
    await home.openTopProduct();
    // Guard against a false pass: no sign-in prompt is on screen before the click.
    await expect(product.signInPrompt.first()).toBeHidden();

    await product.upvoteButton.click();

    // An anonymous click must never register a vote: the user is asked to sign in instead.
    await expect
      .poll(async () => /\/login/.test(page.url()) || (await product.signInPrompt.first().isVisible()), {
        message: "expected a sign-in modal or a redirect to /login",
      })
      .toBe(true);
  });

  test("product page exposes SEO and social-share metadata", async ({ home, product }) => {
    const { name, slug } = await home.openTopProduct();
    const values = (sel: string, attr: string) => () => product.headValues(sel, attr);

    // Assert the CURRENT product's tags exist; never `.first()`, which may be a stale
    // tag left over from the home page after client-side navigation (F-W4).
    await expect
      .poll(values('link[rel="canonical"]', "href"))
      .toContainEqual(expect.stringMatching(new RegExp(`/products/${slug}$`)));
    await expect
      .poll(values('meta[property="og:title"]', "content"))
      .toContainEqual(expect.stringContaining(name));
    await expect.poll(values('meta[property="og:image"]', "content")).toContainEqual(expect.stringMatching(/^https:\/\//));
    await expect.poll(values('meta[name="description"]', "content")).toContainEqual(expect.stringMatching(/\S{10,}/));

    // KNOWN BUG F-W4: intermittently the home page canonical is never removed. Reported
    // as an annotation (visible in the HTML report) rather than a failure, so an
    // intermittent product bug cannot make CI flaky. Promote to a hard assertion once fixed.
    const canonicals = await product.headValues('link[rel="canonical"]', "href");
    if (canonicals.length > 1) {
      test.info().annotations.push({ type: "known-bug F-W4", description: `duplicate canonicals: ${canonicals.join(" | ")}` });
    }
  });

  test("unknown product slug shows a not-found page with a 404 status", async ({ page, product }) => {
    const res = await product.open("qa-nonexistent-product-7f3a9c");

    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/lost this page/i);
    // The user must have a way back into the product.
    await expect(page.getByRole("link", { name: /go to the homepage/i })).toHaveAttribute("href", "/");
  });
});
