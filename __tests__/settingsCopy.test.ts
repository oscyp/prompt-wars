import {
  HAPTICS_COPY,
  NOTIFICATION_COPY,
  appVersionLabel,
} from '@/utils/settingsCopy';

describe('NOTIFICATION_COPY', () => {
  it('does not promise quiet hours the app has no UI for', () => {
    for (const value of Object.values(NOTIFICATION_COPY)) {
      expect(value.toLowerCase()).not.toMatch(/quiet hours/);
    }
  });

  it('names the must-send category in player words', () => {
    expect(NOTIFICATION_COPY.resultsLabel).toBe('Battle results');
    expect(NOTIFICATION_COPY.resultsLabel).not.toMatch(/Must-Send/i);
    expect(NOTIFICATION_COPY.resultsSubline).toBe('Always on');
  });

  it('pins the cap sentence', () => {
    expect(NOTIFICATION_COPY.subtitle).toBe(
      'At most two a day, apart from battle results.',
    );
  });

  it('tells the player where the OS switch lives', () => {
    expect(NOTIFICATION_COPY.permissionDenied).toBe(
      'Notifications are off for Prompt Wars in system settings',
    );
    expect(NOTIFICATION_COPY.openSettings).toBe('Open Settings');
  });
});

describe('HAPTICS_COPY', () => {
  it('labels the switch', () => {
    expect(HAPTICS_COPY.label).toBe('Haptics');
  });
});

describe('appVersionLabel', () => {
  it('includes the build number when present', () => {
    expect(appVersionLabel('1.0.0', '12')).toBe('Version 1.0.0 (12)');
    expect(appVersionLabel('1.0.0', 7)).toBe('Version 1.0.0 (7)');
  });

  it('omits an empty build', () => {
    expect(appVersionLabel('1.0.0', null)).toBe('Version 1.0.0');
    expect(appVersionLabel('1.0.0', '')).toBe('Version 1.0.0');
    expect(appVersionLabel('1.0.0')).toBe('Version 1.0.0');
  });

  it('admits when the version is unknown', () => {
    expect(appVersionLabel(undefined)).toBe('Version unknown');
    expect(appVersionLabel('  ')).toBe('Version unknown');
  });
});
