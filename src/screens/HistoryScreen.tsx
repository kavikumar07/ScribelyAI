import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import NavHeader from '../components/NavHeader';
import { supabase } from '../config/supabase';

export default function HistoryScreen({ navigation, route }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | 'All'>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'All'>('All');
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  const YEARS = ['All', 2024, 2025, 2026];
  const MONTHS = [
    { label: 'All', value: 'All' as const },
    { label: 'Jan', value: 0 }, { label: 'Feb', value: 1 }, { label: 'Mar', value: 2 },
    { label: 'Apr', value: 3 }, { label: 'May', value: 4 }, { label: 'Jun', value: 5 },
    { label: 'Jul', value: 6 }, { label: 'Aug', value: 7 }, { label: 'Sep', value: 8 },
    { label: 'Oct', value: 9 }, { label: 'Nov', value: 10 }, { label: 'Dec', value: 11 }
  ];

  const fetchSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const mapped = data.map(s => ({
        ...s,
        id: s.session_id,
        timestamp: new Date(s.created_at).getTime() / 1000
      }));
      setSessions(mapped);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSessions();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchSessions();
  };

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.title?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const date = new Date(s.timestamp * 1000);
    if (selectedYear !== 'All' && date.getFullYear() !== selectedYear) return false;
    if (selectedMonth !== 'All' && date.getMonth() !== selectedMonth) return false;

    return true;
  });

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('Notes', { sessionId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.emoji}>📝</Text>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        </View>
        <View style={[
          styles.statusBadge, 
          item.status === 'completed' ? styles.statusReady : styles.statusProcessing
        ]}>
          <Text style={styles.statusText}>
            {item.status === 'completed' ? 'Completed' : 'Processing'}
          </Text>
        </View>
      </View>
      <Text style={styles.date}>
        {new Date(item.timestamp * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <NavHeader title="Notes History" />
      
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <FontAwesome name="search" size={16} color="#284b63" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search history..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity 
          style={[styles.filterButton, (selectedMonth !== 'All' || selectedYear !== 'All') && styles.filterButtonActive]} 
          onPress={() => setFilterModalVisible(true)}
        >
          <FontAwesome name="filter" size={18} color={(selectedMonth !== 'All' || selectedYear !== 'All') ? "#fff" : "#284b63"} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#284b63" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredSessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No notes found for this filter.</Text>
            </View>
          }
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={isFilterModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
        statusBarTranslucent={true}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter History</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.filterSubLabel}>Year</Text>
            <View style={styles.yearRow}>
              {YEARS.map(y => (
                <TouchableOpacity 
                  key={y} 
                  style={[styles.yearChip, selectedYear === y && styles.activeYearChip]}
                  onPress={() => setSelectedYear(y as any)}
                >
                  <Text style={[styles.yearText, selectedYear === y && styles.activeYearText]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSubLabel}>Month</Text>
            <View style={styles.monthGrid}>
              {MONTHS.map(m => (
                <TouchableOpacity 
                  key={m.label} 
                  style={[styles.monthBox, selectedMonth === m.value && styles.activeMonthBox]}
                  onPress={() => setSelectedMonth(m.value)}
                >
                  <Text style={[styles.monthText, selectedMonth === m.value && styles.activeMonthText]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 15,
    marginTop: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 15,
    borderRadius: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#353535',
  },
  filterButton: {
    width: 46,
    height: 46,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#284b63',
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emoji: {
    fontSize: 18,
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#353535',
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginLeft: 10,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2f3',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tagText: {
    color: '#284b63',
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  statusReady: {
    backgroundColor: '#e6f4ea',
  },
  statusProcessing: {
    backgroundColor: '#e8f0fe',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#353535',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    fontSize: 20,
    color: '#999',
  },
  filterSubLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    color: '#353535',
  },
  yearRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  yearChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  activeYearChip: {
    backgroundColor: '#284b63',
  },
  yearText: {
    color: '#666',
  },
  activeYearText: {
    color: '#fff',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 30,
  },
  monthBox: {
    width: '23%',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  activeMonthBox: {
    backgroundColor: '#284b63',
  },
  monthText: {
    fontSize: 12,
    color: '#666',
  },
  activeMonthText: {
    color: '#fff',
  },
  applyBtn: {
    backgroundColor: '#284b63',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  }
});
