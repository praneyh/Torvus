import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

interface Props {
  title: string;
  icon: string;
  label: string;
  sub: string;
}

export default function PlaceholderScreen({ title, icon, label, sub }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.body}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0D0B' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  back: { fontSize: 32, color: '#EF6C3E', lineHeight: 36 },
  title: { fontSize: 18, fontWeight: '700', color: '#F2F0EB' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 40, marginBottom: 16 },
  label: { fontSize: 18, fontWeight: '700', color: '#F2F0EB', marginBottom: 8 },
  sub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 22 },
});
