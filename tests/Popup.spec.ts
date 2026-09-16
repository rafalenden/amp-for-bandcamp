import { test, expect } from './fixtures';

test('popup saves settings and restores them after reopening', async ({
  page,
  extensionId,
}) => {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  await page.goto(popupUrl);
  const keyboardShortcuts = page.getByRole('checkbox', {
    name: 'Enable keyboard shortcuts',
  });
  await expect(keyboardShortcuts).toBeEnabled();
  await expect(keyboardShortcuts).toBeChecked();
  await expect(page.locator('#seekSeconds')).toHaveAttribute('max', '120');

  await page.getByRole('slider', { name: 'Track volume' }).fill('42');
  await expect(page.locator('#volumeValue')).toHaveText('42%');
  await page.getByRole('slider', { name: 'Seek duration' }).fill('60');
  await keyboardShortcuts.uncheck();
  await expect(page.locator('#keyboardShortcutsSection')).toBeHidden();
  await expect(page.locator('#seekDurationSection')).toBeHidden();
  await page
    .getByRole('checkbox', { name: 'Show BPM on album pages' })
    .uncheck();

  // Opening another popup verifies storage independently of the first React tree.
  const reopened = await page.context().newPage();
  await reopened.goto(popupUrl);
  await expect(
    reopened.getByRole('checkbox', { name: 'Enable keyboard shortcuts' }),
  ).not.toBeChecked();
  await expect(reopened.locator('#volumeSlider')).toHaveValue('42');
  await expect(
    reopened.getByRole('checkbox', { name: 'Show BPM on album pages' }),
  ).not.toBeChecked();
  await reopened
    .getByRole('checkbox', { name: 'Enable keyboard shortcuts' })
    .check();
  await expect(reopened.locator('#seekSeconds')).toHaveValue('60');
  await expect(page.locator('#keyboardShortcutsSection')).toBeVisible();
  await expect(reopened.getByRole('alert')).toHaveCount(0);
});
