import { test, expect } from './fixtures';

test('popup saves settings and restores them after reopening', async ({
  extension,
}) => {
  const popup = await extension.openPopup();
  const keyboardShortcuts = popup.getByRole('checkbox', {
    name: 'Enable keyboard shortcuts',
  });
  await expect(keyboardShortcuts).toBeEnabled();
  await expect(keyboardShortcuts).toBeChecked();
  await expect(popup.locator('#seekSeconds')).toHaveAttribute('max', '120');

  await popup.getByRole('slider', { name: 'Track volume' }).fill('42');
  await expect(popup.locator('#volumeValue')).toHaveText('42%');
  await popup.getByRole('slider', { name: 'Seek duration' }).fill('60');
  await keyboardShortcuts.uncheck();
  await expect(popup.locator('#keyboardShortcutsSection')).toBeHidden();
  await expect(popup.locator('#seekDurationSection')).toBeHidden();
  await popup
    .getByRole('checkbox', { name: 'Show BPM on album pages' })
    .uncheck();

  // Opening another popup verifies storage independently of the first React tree.
  const reopened = await extension.openPopup();
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
  await expect(popup.locator('#keyboardShortcutsSection')).toBeVisible();
  await expect(reopened.getByRole('alert')).toHaveCount(0);
});
