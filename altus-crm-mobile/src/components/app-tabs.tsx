import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeTabs } from 'expo-router/native-tabs';

import { Colors } from '@/constants/theme';
import { isAmbassador } from '@/types/api';
import { useAuth } from '@/lib/auth-context';

// The web CRM has no dark mode, so this tab bar always uses the same brand palette regardless
// of device color scheme (see constants/theme.ts).
const colors = Colors.light;

const { VectorIcon, Icon, Label } = NativeTabs.Trigger;

function icon(outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) {
  return (
    <Icon
      src={{
        default: <VectorIcon family={Ionicons} name={outline} />,
        selected: <VectorIcon family={Ionicons} name={filled} />,
      }}
    />
  );
}

// Mirrors the web CRM's mnav (mobileTabs() in components/crm2/CrmApp.tsx): a role-aware tab set —
// non-ambassadors get Home/Leads/Follow-ups/Calls/More, ambassadors get Home/Leads/Focused/Meetings/More.
export default function AppTabs() {
  const { user } = useAuth();
  const ambassador = isAmbassador(user?.roles ?? []);

  return (
    <NativeTabs
      backgroundColor={colors.card}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="home">
        <Label>Home</Label>
        {icon('home-outline', 'home')}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <Label>Leads</Label>
        {icon('list-outline', 'list')}
      </NativeTabs.Trigger>

      {ambassador ? (
        <NativeTabs.Trigger name="focused">
          <Label>Focused</Label>
          {icon('flash-outline', 'flash')}
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="follow-ups">
          <Label>Follow-ups</Label>
          {icon('calendar-outline', 'calendar')}
        </NativeTabs.Trigger>
      )}

      {ambassador ? (
        <NativeTabs.Trigger name="meetings">
          <Label>Meetings</Label>
          {icon('videocam-outline', 'videocam')}
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="calls">
          <Label>Calls</Label>
          {icon('call-outline', 'call')}
        </NativeTabs.Trigger>
      )}

      <NativeTabs.Trigger name="more">
        <Label>More</Label>
        {icon('menu-outline', 'menu')}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
