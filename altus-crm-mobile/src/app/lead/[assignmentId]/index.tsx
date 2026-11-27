import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
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

        <SectionHeader label="Overview" />
        <FieldsGrid>
          <Field label="Phone" value={lead.phone || '—'} />
          <Field label="Email" value={lead.email || '—'} />
          <Field label="Resolution" value={lead.resolution || 'Not called'} />
          <Field label="Next follow-up" value={lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleString() : '—'} />
        </FieldsGrid>

        <SectionHeader label="BANT" />
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

        <SectionHeader label="Activity" />
        {activity === null ? (
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
          onSubmit={async (resolutionId, note) => {
            setBusy(true);
            const result = await api.post<{ message: string }>(`/api/mobile/leads/${assignmentId}/calls`, { resolutionId, note });
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

function SectionHeader({ label }: { label: string }) {
  return (
    <ThemedText type="small" themeColor="faint" style={styles.sectionHeader}>
      {label.toUpperCase()}
    </ThemedText>
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

function LogCallModal({ resolutions, busy, onClose, onSubmit }: { resolutions: { id: string; name: string }[]; busy: boolean; onClose: () => void; onSubmit: (resolutionId: string, note: string) => void }) {
  const theme = useTheme();
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <ModalSheet onClose={onClose}>
      <ThemedText type="small" themeColor="faint" style={styles.modalTitle}>
        LOG CALL
      </ThemedText>
      {resolutions.map((resolution) => (
        <Pressable key={resolution.id} style={styles.modalOption} onPress={() => setResolutionId(resolution.id)}>
          <ThemedText themeColor={resolution.id === resolutionId ? 'accent' : 'text'} style={resolution.id === resolutionId ? styles.modalOptionSelected : undefined}>
            {resolution.name}
          </ThemedText>
        </Pressable>
      ))}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={theme.faint}
        style={[styles.modalInput, { color: theme.text, borderColor: theme.border }]}
      />
      <Pressable
        disabled={!resolutionId || busy}
        style={[styles.modalSubmit, { backgroundColor: theme.accent }, (!resolutionId || busy) && styles.buttonDisabled]}
        onPress={() => resolutionId && onSubmit(resolutionId, note)}>
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
  sectionHeader: { marginTop: Spacing.four, marginBottom: Spacing.two, fontWeight: '700', letterSpacing: 0.6 },
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
