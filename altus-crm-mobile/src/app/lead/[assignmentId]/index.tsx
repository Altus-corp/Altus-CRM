import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/avatar';
import { Pill } from '@/components/pill';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { BantTone, BucketTone, CardShadow, Radius, Spacing } from '@/constants/theme';
import { BANT_FIELD_LABELS, BANT_OPTIONS, bantCustomKey, type ActivityItem, type BantField, type MobileLeadDetail } from '@/types/api';

export default function LeadDetailScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const theme = useTheme();
  const [lead, setLead] = useState<MobileLeadDetail | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bantPicker, setBantPicker] = useState<BantField | null>(null);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'overview' | 'bant' | 'activity'>('overview');

  const load = useCallback(async () => {
    const [leadResult, activityResult] = await Promise.all([
      api.get<{ lead: MobileLeadDetail }>(`/api/mobile/leads/${assignmentId}`),
      api.get<{ activity: ActivityItem[] }>(`/api/mobile/leads/${assignmentId}/activity`),
    ]);
    if (!leadResult.ok) { setError(leadResult.error); return; }
    setError(null);
    setLead(leadResult.lead);
    if (activityResult.ok) setActivity(activityResult.activity);
  }, [assignmentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, see src/lib/auth-context.tsx
  useEffect(() => { void load(); }, [load]);

  const saveBant = async (field: BantField, value: string) => {
    setBantPicker(null);
    setBusy(true);
    const result = await api.post<{ message: string }>(`/api/mobile/leads/${assignmentId}/bant`, { field, value });
    setBusy(false);
    if (result.ok) setLead((prev) => (prev ? { ...prev, custom: { ...prev.custom, [bantCustomKey(field)]: value } } : prev));
    else setError(result.error);
  };

  if (!lead && !error) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </ThemedView>
    );
  }
  if (!lead) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="accent" style={styles.errorText}>
          {error}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedView style={styles.headerRow}>
          <Avatar name={lead.name || '—'} size={48} />
          <ThemedView style={styles.headerText}>
            <ThemedText type="title" style={styles.title} numberOfLines={1}>
              {lead.name || 'Unnamed lead'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" numberOfLines={1}>
              {[lead.company, lead.product, lead.stage].filter(Boolean).join(' · ')}
            </ThemedText>
          </ThemedView>
          <Pill tone={lead.bucket} label={BucketTone[lead.bucket].label} />
        </ThemedView>

        <ThemedView style={styles.actionsRow}>
          {!!lead.phone && (
            <Pressable style={[styles.actionBtn, { backgroundColor: theme.card, borderColor: theme.border }, CardShadow]} onPress={() => Linking.openURL(`tel:${lead.phone}`)}>
              <ThemedText themeColor="ink2" style={styles.actionBtnText}>
                Call
              </ThemedText>
            </Pressable>
          )}
          <Pressable style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: theme.accent }]} onPress={() => setLogCallOpen(true)}>
            <ThemedText style={styles.actionBtnPrimaryText}>Log Call</ThemedText>
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: theme.card, borderColor: theme.border }, CardShadow]} onPress={() => setAddNoteOpen(true)}>
            <ThemedText themeColor="ink2" style={styles.actionBtnText}>
              Add Note
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={[styles.tabs, { borderBottomColor: theme.border }]}>
          {([
            ['overview', 'Overview'],
            ['bant', 'BANT'],
            ['activity', 'Activity'],
          ] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && { borderBottomColor: theme.accent }]}>
              <ThemedText type="smallBold" themeColor={tab === key ? 'accent' : 'textSecondary'} style={styles.tabText}>
                {label.toUpperCase()}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>

        {tab === 'overview' && (
          <FieldsGrid>
            <Field label="Phone" value={lead.phone || '—'} />
            <Field label="Email" value={lead.email || '—'} />
            <Field label="Resolution" value={lead.resolution || 'Not called'} />
            <Field label="Next follow-up" value={lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleString() : '—'} />
          </FieldsGrid>
        )}

        {tab === 'bant' && (
          <ThemedView style={styles.bantRow}>
            {(Object.keys(BANT_FIELD_LABELS) as BantField[]).map((field) => {
              const value = lead.custom[bantCustomKey(field)] ?? '';
              const tone = BantTone[value];
              return (
                <Pressable
                  key={field}
                  onPress={() => setBantPicker(field)}
                  style={[
                    styles.bantCell,
                    { borderColor: theme.border, backgroundColor: tone?.bg ?? theme.backgroundElement },
                  ]}>
                  <ThemedText style={[styles.bantLetter, { color: tone?.ink ?? theme.faint }]}>{field.toUpperCase()}</ThemedText>
                  <ThemedText style={[styles.bantValue, { color: tone?.ink ?? theme.textSecondary }]} numberOfLines={1}>
                    {value || 'Select'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>
        )}

        {tab === 'activity' && (
          activity === null ? (
            <ActivityIndicator color={theme.accent} />
          ) : activity.length === 0 ? (
            <ThemedText themeColor="textSecondary">No activity yet.</ThemedText>
          ) : (
            <ThemedView style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }, CardShadow]}>
              {activity.map((item, index) => (
                <ThemedView
                  key={item.id}
                  style={[styles.activityRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                  type="card">
                  <ThemedView style={[styles.activityDot, { backgroundColor: theme.accent }]} />
                  <ThemedView style={styles.activityBody} type="card">
                    <ThemedText type="smallBold">{item.activityType.replace(/_/g, ' ')}</ThemedText>
                    {!!item.note && (
                      <ThemedText type="small" style={styles.activityNote}>
                        {item.note}
                      </ThemedText>
                    )}
                    <ThemedText type="small" themeColor="faint">
                      {new Date(item.createdAt).toLocaleString()}
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
              ))}
            </ThemedView>
          )
        )}
      </ScrollView>

      {bantPicker && (
        <OptionModal
          title={BANT_FIELD_LABELS[bantPicker]}
          options={BANT_OPTIONS[bantPicker]}
          onClose={() => setBantPicker(null)}
          onPick={(value) => void saveBant(bantPicker, value)}
        />
      )}
      {logCallOpen && (
        <LogCallModal
          resolutions={lead.availableResolutions}
          busy={busy}
          onClose={() => setLogCallOpen(false)}
          onSubmit={async (resolutionId, note, followUpAt) => {
            setBusy(true);
            const result = await api.post<{ message: string }>(`/api/mobile/leads/${assignmentId}/calls`, { resolutionId, note, followUpAt });
            setBusy(false);
            if (result.ok) { setLogCallOpen(false); void load(); } else setError(result.error);
          }}
        />
      )}
      {addNoteOpen && (
        <NoteModal
          busy={busy}
          onClose={() => setAddNoteOpen(false)}
          onSubmit={async (note) => {
            setBusy(true);
            const result = await api.post<{ message: string }>(`/api/mobile/leads/${assignmentId}/notes`, { note });
            setBusy(false);
            if (result.ok) { setAddNoteOpen(false); void load(); } else setError(result.error);
          }}
        />
      )}
    </SafeAreaView>
  );
}

function FieldsGrid({ children }: { children: ReactNode }) {
  return <ThemedView style={styles.fieldsGrid}>{children}</ThemedView>;
}
function Field({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.field, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <ThemedText type="small" themeColor="faint" style={styles.fieldLabel}>
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText type="smallBold" numberOfLines={1}>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

function ModalSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <ThemedView style={[styles.modalSheet, { backgroundColor: theme.card }]}>{children}</ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OptionModal({ title, options, onClose, onPick }: { title: string; options: string[]; onClose: () => void; onPick: (value: string) => void }) {
  const theme = useTheme();
  return (
    <ModalSheet onClose={onClose}>
      <ThemedText type="small" themeColor="faint" style={styles.modalTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {options.map((option) => (
        <Pressable key={option} style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: theme.backgroundElement }]} onPress={() => onPick(option)}>
          <ThemedText>{option}</ThemedText>
        </Pressable>
      ))}
    </ModalSheet>
  );
}

// Same rule app/dashboard/leads/actions.ts's updateLeadResolutionInline enforces server-side:
// "Verbal Yes" and any resolution named "Follow up" (any spacing/case) require both a follow-up
// date/time and a note — without this, the server rejects the save with nowhere for the user to
// actually enter the date, which is the bug this screen is fixing.
function resolutionRequiresFollowUp(name: string) {
  const normalized = name.trim().toLowerCase();
  return /follow\s*up/.test(normalized) || normalized === 'verbal yes';
}

function LogCallModal({ resolutions, busy, onClose, onSubmit }: { resolutions: { id: string; name: string }[]; busy: boolean; onClose: () => void; onSubmit: (resolutionId: string, note: string, followUpAt: string | null) => void }) {
  const theme = useTheme();
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedResolution = resolutions.find((r) => r.id === resolutionId);
  const needsFollowUp = Boolean(selectedResolution && resolutionRequiresFollowUp(selectedResolution.name));
  // Computed once per modal open rather than inline in render/JSX props, which the React Compiler
  // flags as an impure render (new Date()/Date.now() would otherwise re-evaluate every re-render).
  const now = useMemo(() => new Date(), []);
  const defaultFollowUp = useMemo(() => new Date(now.getTime() + 60 * 60 * 1000), [now]);

  const openPicker = () => {
    const initial = followUpAt ?? defaultFollowUp;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate: now,
        onChange: (dateEvent, pickedDate) => {
          if (dateEvent.type !== 'set' || !pickedDate) return;
          DateTimePickerAndroid.open({
            value: pickedDate,
            mode: 'time',
            onChange: (timeEvent, pickedTime) => {
              if (timeEvent.type === 'set' && pickedTime) setFollowUpAt(pickedTime);
            },
          });
        },
      });
    } else {
      setShowPicker(true);
    }
  };

  const submit = () => {
    if (!resolutionId) return;
    if (needsFollowUp && !followUpAt) return setValidationError('Choose a follow-up date and time.');
    if (needsFollowUp && !note.trim()) return setValidationError('Add a follow-up note.');
    setValidationError(null);
    onSubmit(resolutionId, note, followUpAt ? followUpAt.toISOString() : null);
  };

  return (
    <ModalSheet onClose={onClose}>
      <ThemedText type="small" themeColor="faint" style={styles.modalTitle}>
        LOG CALL
      </ThemedText>
      {resolutions.map((resolution) => (
        <Pressable key={resolution.id} style={styles.modalOption} onPress={() => { setResolutionId(resolution.id); setValidationError(null); }}>
          <ThemedText themeColor={resolution.id === resolutionId ? 'accent' : 'text'} style={resolution.id === resolutionId ? styles.modalOptionSelected : undefined}>
            {resolution.name}
          </ThemedText>
        </Pressable>
      ))}

      {needsFollowUp && (
        <Pressable onPress={openPicker} style={[styles.modalInput, { borderColor: theme.border }]}>
          <ThemedText themeColor={followUpAt ? 'text' : 'faint'}>
            {followUpAt ? followUpAt.toLocaleString() : 'Select follow-up date & time *'}
          </ThemedText>
        </Pressable>
      )}
      {Platform.OS === 'ios' && showPicker && (
        <DateTimePicker
          value={followUpAt ?? defaultFollowUp}
          mode="datetime"
          minimumDate={now}
          onChange={(event, pickedDate) => {
            setShowPicker(false);
            if (event.type === 'set' && pickedDate) setFollowUpAt(pickedDate);
          }}
        />
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={needsFollowUp ? 'Follow-up note *' : 'Note (optional)'}
        placeholderTextColor={theme.faint}
        style={[styles.modalInput, { color: theme.text, borderColor: theme.border }]}
      />

      {validationError && (
        <ThemedText type="small" themeColor="accent" style={styles.errorText}>
          {validationError}
        </ThemedText>
      )}

      <Pressable
        disabled={!resolutionId || busy}
        style={[styles.modalSubmit, { backgroundColor: theme.accent }, (!resolutionId || busy) && styles.buttonDisabled]}
        onPress={submit}>
        <ThemedText style={styles.modalSubmitText}>{busy ? 'Saving…' : 'Save'}</ThemedText>
      </Pressable>
    </ModalSheet>
  );
}

function NoteModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  return (
    <ModalSheet onClose={onClose}>
      <ThemedText type="small" themeColor="faint" style={styles.modalTitle}>
        ADD NOTE
      </ThemedText>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Write a note…"
        placeholderTextColor={theme.faint}
        multiline
        style={[styles.modalInput, styles.modalTextarea, { color: theme.text, borderColor: theme.border }]}
      />
      <Pressable disabled={!note.trim() || busy} style={[styles.modalSubmit, { backgroundColor: theme.accent }, (!note.trim() || busy) && styles.buttonDisabled]} onPress={() => onSubmit(note.trim())}>
        <ThemedText style={styles.modalSubmitText}>{busy ? 'Saving…' : 'Save'}</ThemedText>
      </Pressable>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.three, gap: Spacing.one, paddingBottom: Spacing.six },
  errorText: { fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.four },
  actionBtn: { flex: 1, borderRadius: Radius.small, borderWidth: 1, paddingVertical: Spacing.two, alignItems: 'center' },
  actionBtnText: { fontWeight: '700', fontSize: 13 },
  actionBtnPrimary: { borderWidth: 0 },
  actionBtnPrimaryText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.three },
  tab: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, marginRight: Spacing.one, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { letterSpacing: 0.4 },
  fieldsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { width: '47%', borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  fieldLabel: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 3, fontSize: 9 },
  bantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  bantCell: { borderRadius: Radius.small, borderWidth: 1, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, minWidth: 74 },
  bantLetter: { fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },
  bantValue: { fontWeight: '700', fontSize: 12, marginTop: 2 },
  activityCard: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden' },
  activityRow: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.two },
  activityDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  activityBody: { flex: 1, gap: 2 },
  activityNote: { opacity: 0.9 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20,20,24,0.38)', justifyContent: 'flex-end' },
  modalSheet: { padding: Spacing.three, borderTopLeftRadius: Spacing.three, borderTopRightRadius: Spacing.three, gap: Spacing.one },
  modalTitle: { marginBottom: Spacing.two, fontWeight: '700', letterSpacing: 0.6 },
  modalOption: { paddingVertical: Spacing.two },
  modalOptionSelected: { fontWeight: '700' },
  modalInput: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, marginTop: Spacing.two },
  modalTextarea: { minHeight: 90, textAlignVertical: 'top' },
  modalSubmit: { borderRadius: Radius.small, paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.three },
  modalSubmitText: { color: '#ffffff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
});
