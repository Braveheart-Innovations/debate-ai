let demoEnabled = false;

export function setDemoModeEnabled(enabled: boolean): void {
  demoEnabled = !!enabled;
}

export function isDemoModeEnabled(): boolean {
  return demoEnabled;
}

