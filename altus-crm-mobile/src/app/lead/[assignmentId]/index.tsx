import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';
import { BANT_FIELD_LABELS, BANT_OPTIONS, BANT_TONE, bantCustomKey, type ActivityItem, type BantField, type MobileLeadDetail } from '@/types/api';

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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, see (tabs)/index.tsx
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
        <ActivityIndicator />
      </ThemedView>
    );
  }
  if (!lead) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.error}>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title" style={styles.title}>
          {lead.name || 'Unnamed lead'}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{[lead.company, lead.product, lead.stage].filter(Boolean).join(' · ')}</ThemedText>

        <ThemedView style={styles.actionsRow}>
          {!!lead.phone && (
            <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${lead.phone}`)}>
              <ThemedText style={styles.actionBtnText}>Call</ThemedText>
            </Pressable>
          )}
          <Pressable style={styles.actionBtn} onPress={() => setLogCallOpen(true)}>
            <ThemedText style={styles.actionBtnText}>Log Call</ThemedText>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => setAddNoteOpen(true)}>
            <ThemedText style={styles.actionBtnText}>Add Note</ThemedText>
          </Pressable>
        </ThemedView>

        <SectionHeader label="Overview" />
        <InfoRow label="Phone" value={lead.phone || '—'} />
        <InfoRow label="Email" value={lead.email || '—'} />
        <InfoRow label="Resolution" value={lead.resolution || 'Not called'} />
        <InfoRow label="Next follow-up" value={lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleString() : '—'} />

        <SectionHeader label="BANT" />
        <ThemedView style={styles.bantRow}>
          {(Object.keys(BANT_FIELD_LABELS) as BantField[]).map((field) => {
            const value = lead.custom[bantCustomKey(field)] ?? '';
            const tone = BANT_TONE[value];
            const bg = tone === 'yellow' ? '#FCF5D9' : tone === 'green' ? '#DCFCE7' : tone === 'grey' ? '#F1F1F1' : theme.backgroundElement;
            return (
              <Pressable key={field} onPress={() => setBantPicker(field)} style={[styles.bantCell, { backgroundColor: bg }]}>
                <ThemedText type="smallBold" style={{ color: theme.text }}>
                  {field.toUpperCase()}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.text }}>
                  {value || 'Select'}
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>

        <SectionHeader label="Activity" />
        {activity === null ? (
          <ActivityIndicator />
        ) : activity.length === 0 ? (
          <ThemedText themeColor="textSecondary">No activity yet.</ThemedText>
        ) : (
          activity.map((item) => (
            <ThemedView key={item.id} style={styles.activityRow}>
              <ThemedText type="smallBold">{item.activityType}</ThemedText>
              {!!item.note && <ThemedText type="small">{item.note}</ThemedText>}
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(item.createdAt).toLocaleString()}
              </ThemedText>
            </ThemedView>
          ))
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
    <ThemedText type="smallBold" style={styles.sectionHeader}>
      {label}
    </ThemedText>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </ThemedView>
  );
}

function OptionModal({ title, options, onClose, onPick }: { title: string; options: string[]; onClose: () => void; onPick: (value: string) => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <ThemedView style={styles.modalSheet}>
          <ThemedText type="smallBold" style={styles.modalTitle}>
            {title}
          </ThemedText>
          {options.map((option) => (
            <Pressable key={option} style={styles.modalOption} onPress={() => onPick(option)}>
              <ThemedText>{option}</ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      </Pressable>
    </Modal>
  );
}

function LogCallModal({ resolutions, busy, onClose, onSubmit }: { resolutions: { id: string; name: string }[]; busy: boolean; onClose: () => void; onSubmit: (resolutionId: string, note: string) => void }) {
  const theme = useTheme();
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Log Call
            </ThemedText>
            {resolutions.map((resolution) => (
              <Pressable key={resolution.id} style={styles.modalOption} onPress={() => setResolutionId(resolution.id)}>
                <ThemedText style={resolution.id === resolutionId ? { fontWeight: '700' } : undefined}>{resolution.name}</ThemedText>
              </Pressable>
            ))}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.modalInput, { color: theme.text, borderColor: theme.backgroundElement }]}
            />
            <Pressable
              disabled={!resolutionId || busy}
              style={[styles.modalSubmit, (!resolutionId || busy) && styles.buttonDisabled]}
              onPress={() => resolutionId && onSubmit(resolutionId, note)}>
              <ThemedText style={styles.modalSubmitText}>{busy ? 'Saving…' : 'Save'}</ThemedText>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NoteModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Add Note
            </ThemedText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Write a note…"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.modalInput, styles.modalTextarea, { color: theme.text, borderColor: theme.backgroundElement }]}
            />
            <Pressable disabled={!note.trim() || busy} style={[styles.modalSubmit, (!note.trim() || busy) && styles.buttonDisabled]} onPress={() => onSubmit(note.trim())}>
              <ThemedText style={styles.modalSubmitText}>{busy ? 'Saving…' : 'Save'}</ThemedText>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.three, gap: Spacing.one, paddingBottom: Spacing.six },
  title: { fontSize: 26, lineHeight: 32 },
  error: { color: '#D9303C' },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, marginVertical: Spacing.three },
  actionBtn: { backgroundColor: '#D9303C', borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  actionBtnText: { color: '#ffffff', fontWeight: '700' },
  sectionHeader: { marginTop: Spacing.four, marginBottom: Spacing.one, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.one },
  bantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  bantCell: { borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minWidth: 70 },
  activityRow: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#88888833', gap: 2 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' },
  modalSheet: { padding: Spacing.three, borderTopLeftRadius: Spacing.three, borderTopRightRadius: Spacing.three, gap: Spacing.one },
  modalTitle: { marginBottom: Spacing.two },
  modalOption: { paddingVertical: Spacing.two },
  modalInput: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, marginTop: Spacing.two },
  modalTextarea: { minHeight: 90, textAlignVertical: 'top' },
  modalSubmit: { backgroundColor: '#D9303C', borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.three },
  modalSubmitText: { color: '#ffffff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
});
