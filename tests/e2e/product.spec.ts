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
    const { slug } = await home.openTopProduct();

    await expect(product.canonical).toHaveAttribute("href", new RegExp(`/products/${slug}`));
    await expect(product.meta("og:title")).toHaveAttribute("content", /\S/);
    await expect(product.meta("og:image")).toHaveAttribute("content", /^https:\/\//);
    await expect(product.meta("description")).toHaveAttribute("content", /\S{10,}/);
  });

  test("unknown product slug shows a not-found page with a 404 status", async ({ page, product }) => {
    const res = await product.open("qa-nonexistent-product-7f3a9c");

    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/lost this page/i);
    // The user must have a way back into the product.
    await expect(page.getByRole("link", { name: /go to the homepage/i })).toHaveAttribute("href", "/");
  });
});
