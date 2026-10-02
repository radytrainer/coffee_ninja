import { expect, test } from '@playwright/test';

test('keyboard fallback: arrows navigate, Enter selects, Escape goes back', async ({ page }) => {
  await page.goto('/?mode=mouse', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /START/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/menu$/);

  await expect(page.getByRole('button', { name: /^Latte,/ })).toBeVisible();
  await page.keyboard.press('ArrowDown'); // first target (Home)
  await page.keyboard.press('ArrowDown'); // into the content
  const focused = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-gesture-target'),
  );
  expect(focused).not.toBeNull();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/localhost:3000\/(\?.*)?$/);
});
