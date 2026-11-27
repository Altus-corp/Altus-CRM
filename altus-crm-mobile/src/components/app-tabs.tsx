import { NativeTabs } from 'expo-router/native-tabs';

import { Colors } from '@/constants/theme';

// The web CRM has no dark mode, so this tab bar always uses the same brand palette regardless
// of device color scheme (see constants/theme.ts).
const colors = Colors.light;

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={colors.card}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>My Leads</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
