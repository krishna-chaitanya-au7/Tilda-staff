import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface Recipe {
  id: string;
  title: string;
}

interface MenulineDetail {
  id: string;
  menuline_id: string;
  date: string;
  main_course: string; // Recipe ID
  starter: string; // Recipe ID
  dessert: string; // Recipe ID
  recipes_main_course?: Recipe;
  recipes_starter?: Recipe;
  recipes_dessert?: Recipe;
}

interface MealSelection {
  id: string;
  date: string;
  menuline_id: string;
  is_skipped: boolean;
  main_meal_allergy: boolean;
  starter_allergy: boolean;
  dessert_allergy: boolean;
  menuline_details?: {
    recipes_main_course?: Recipe;
    recipes_starter?: Recipe;
    recipes_dessert?: Recipe;
  } | null;
}

interface MahlzeitenTabProps {
  userId: string;
  facilityId: string;
  from?: string | string[];
}

export default function MahlzeitenTab({ userId, facilityId, from }: MahlzeitenTabProps) {
  const [meals, setMeals] = useState<MealSelection[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Details Modal State
  const [selectedMeal, setSelectedMeal] = useState<MealSelection | null>(null);
  const [availableMenulines, setAvailableMenulines] = useState<MenulineDetail[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const source = Array.isArray(from) ? from[0] : from;

  useEffect(() => {
    const fetchMealsAndDetails = async () => {
      if (!userId || !facilityId) return;
      setLoading(true);
      try {
        // 1. Fetch Recipes
        const { data: recipesData } = await supabase
          .from('recipes')
          .select('id, title')
          .eq('is_deleted', false);
        
        const recipesMap = new Map<string, Recipe>();
        recipesData?.forEach((r: any) => recipesMap.set(r.id, r));

        // 2. Fetch Meal Selections
        const { data: mealsData, error: mealsError } = await supabase
          .from('meal_selections')
          .select('id, date, menuline_id, is_skipped, main_meal_allergy, starter_allergy, dessert_allergy')
          .eq('user_id', userId)
          .eq('facility_id', facilityId)
          .eq('is_deleted', false)
          .order('date', { ascending: false });

        if (mealsError) throw mealsError;
        if (!mealsData || mealsData.length === 0) {
           setMeals([]);
           return;
        }

        // 3. Fetch Menuline Details
        const menulineIds = Array.from(new Set(mealsData.map((m: any) => m.menuline_id).filter(Boolean)));
        
        let menulinesMap = new Map<string, MenulineDetail>();
        if (menulineIds.length > 0) {
           const { data: menulinesData } = await supabase
             .from('menuline_details')
             .select('*')
             .in('menuline_id', menulineIds);
           
           menulinesData?.forEach((m: any) => {
              const key = `${m.menuline_id}_${m.date}`;
              menulinesMap.set(key, m);
           });
        }

        // 4. Enrich Data
        const enriched: MealSelection[] = mealsData.map((meal: any) => {
           const detailsKey = `${meal.menuline_id}_${meal.date}`;
           const details = menulinesMap.get(detailsKey);
           
           return {
              ...meal,
              menuline_details: details ? {
                 recipes_main_course: details.main_course ? recipesMap.get(details.main_course) : undefined,
                 recipes_starter: details.starter ? recipesMap.get(details.starter) : undefined,
                 recipes_dessert: details.dessert ? recipesMap.get(details.dessert) : undefined,
              } : null
           };
        });

        setMeals(enriched);

      } catch (error) {
        console.error('Error fetching meals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMealsAndDetails();
  }, [userId, facilityId, refreshTrigger]);

  // Fetch available menulines when opening modal
  useEffect(() => {
     if (!selectedMeal || !facilityId) return;
     
     const fetchOptions = async () => {
        setModalLoading(true);
        try {
           // 1. Get menuline IDs for this facility
           const { data: facilityMenulines } = await supabase
              .from("facility_menuline")
              .select("menuline_id")
              .eq("facility_id", facilityId)
              .eq("is_deleted", false);
           
           const menulineIds = facilityMenulines?.map(fm => fm.menuline_id) || [];
           if (menulineIds.length === 0) {
              setAvailableMenulines([]);
              return;
           }

           // 2. Get menuline details for the specific date
           const { data: details } = await supabase
              .from("menuline_details")
              .select("*")
              .in("menuline_id", menulineIds)
              .eq("date", selectedMeal.date);
           
           // 3. Fetch Recipe Titles
           if (details && details.length > 0) {
              const recipeIds = new Set<string>();
              details.forEach(d => {
                 if (d.main_course) recipeIds.add(d.main_course);
                 if (d.starter) recipeIds.add(d.starter);
                 if (d.dessert) recipeIds.add(d.dessert);
              });

              const { data: recipes } = await supabase
                 .from('recipes')
                 .select('id, title')
                 .in('id', Array.from(recipeIds));
              
              const rMap = new Map(recipes?.map(r => [r.id, r]));

              const enrichedDetails = details.map(d => ({
                 ...d,
                 recipes_main_course: d.main_course ? rMap.get(d.main_course) : undefined,
                 recipes_starter: d.starter ? rMap.get(d.starter) : undefined,
                 recipes_dessert: d.dessert ? rMap.get(d.dessert) : undefined,
              }));
              
              setAvailableMenulines(enrichedDetails);
           } else {
              setAvailableMenulines([]);
           }

        } catch (err) {
           console.error("Error fetching meal options:", err);
        } finally {
           setModalLoading(false);
        }
     };

     fetchOptions();
  }, [selectedMeal, facilityId]);

  const handleSelectMenuline = async (menuline: MenulineDetail) => {
     if (!userId || !selectedMeal) return;
     try {
        const uniqueId = `${selectedMeal.date}-${userId}-${facilityId}`;
        // Upsert meal selection
        const { error } = await supabase.from("meal_selections").upsert({
           unique_id: uniqueId,
           user_id: userId,
           facility_id: facilityId,
           date: selectedMeal.date,
           menuline_id: menuline.menuline_id,
           is_skipped: false,
           // Note: Allergies should be recalculated here ideally, but simplified for now
           is_deleted: false
        }, { onConflict: 'unique_id' });

        if (error) throw error;
        
        setSelectedMeal(null);
        setRefreshTrigger(p => p + 1); // Refresh list
     } catch (err) {
        console.error("Error updating meal:", err);
     }
  };

  const handleToggleSkip = async () => {
     if (!selectedMeal) return;
     try {
        const { error } = await supabase
           .from("meal_selections")
           .update({ is_skipped: !selectedMeal.is_skipped })
           .eq("id", selectedMeal.id);
        
        if (error) throw error;
        
        setSelectedMeal(null);
        setRefreshTrigger(p => p + 1);
     } catch (err) {
        console.error("Error toggling skip:", err);
     }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading mahlzeiten...</ThemedText>
      </View>
    );
  }

  if (meals.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>Keine Mahlzeiten gefunden</ThemedText>
      </View>
    );
  }

  const renderItem = ({ item }: { item: MealSelection }) => {
    const details = item.menuline_details;
    const isSkipped = item.is_skipped;

    return (
      <View style={styles.row}>
        <View style={styles.colDate}>
           <Text style={styles.cellText}>
             {format(parseISO(item.date), 'dd.MM.yyyy', { locale: de })}
           </Text>
        </View>
        
        {isSkipped ? (
           <>
              <View style={[styles.colContent, { flex: 3 }]}>
                 <Text style={styles.skippedText}>Cancelled</Text>
              </View>
              <View style={styles.colAction}>
                 <View style={styles.badgeSkipped}><Text style={styles.badgeTextSkipped}>Cancelled</Text></View>
                 {source === 'klassen' && (
                    <TouchableOpacity 
                        style={[styles.detailsBtn, { marginTop: 8 }]}
                        onPress={() => setSelectedMeal(item)}
                    >
                       <Text style={styles.detailsBtnText}>Details</Text>
                    </TouchableOpacity>
                 )}
              </View>
           </>
        ) : (
           <>
              <View style={styles.colContent}>
                 <Text style={[styles.cellText, item.starter_allergy && styles.allergyText]}>
                    {details?.recipes_starter?.title || '-'}
                 </Text>
              </View>
              <View style={styles.colContent}>
                 <Text style={[styles.cellText, item.main_meal_allergy && styles.allergyText]}>
                    {details?.recipes_main_course?.title || '-'}
                 </Text>
              </View>
              <View style={styles.colContent}>
                 <Text style={[styles.cellText, item.dessert_allergy && styles.allergyText]}>
                    {details?.recipes_dessert?.title || '-'}
                 </Text>
              </View>
              <View style={styles.colAction}>
                 {source === 'klassen' && (
                    <TouchableOpacity 
                        style={styles.detailsBtn}
                        onPress={() => setSelectedMeal(item)}
                    >
                       <Text style={styles.detailsBtnText}>Details</Text>
                    </TouchableOpacity>
                 )}
              </View>
           </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
         <Text style={styles.headerCellDate}>Date</Text>
         <Text style={styles.headerCellContent}>Starter</Text>
         <Text style={styles.headerCellContent}>Main Course</Text>
         <Text style={styles.headerCellContent}>Dessert</Text>
         <Text style={styles.headerCellAction}>Actions</Text>
      </View>
      <FlatList
        data={meals}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        scrollEnabled={false}
      />

      {/* Details Modal */}
      <Modal visible={!!selectedMeal} transparent animationType="fade" onRequestClose={() => setSelectedMeal(null)}>
         <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                     Meal Selection for {selectedMeal ? format(parseISO(selectedMeal.date), 'dd.MM.yyyy', { locale: de }) : ''}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedMeal(null)}>
                     <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
               </View>

               <ScrollView style={styles.modalBody}>
                  {/* Action Row */}
                  <View style={{ alignItems: 'flex-end', marginBottom: 16 }}>
                     <TouchableOpacity 
                        style={[styles.actionBtn, selectedMeal?.is_skipped ? styles.btnSuccess : styles.btnDanger]}
                        onPress={handleToggleSkip}
                     >
                        <Text style={[styles.actionBtnText, selectedMeal?.is_skipped ? styles.textSuccess : styles.textDanger]}>
                           {selectedMeal?.is_skipped ? "Unskip Meal" : "Skip Meal"}
                        </Text>
                     </TouchableOpacity>
                  </View>

                  {modalLoading ? (
                     <ActivityIndicator size="large" color="#007AFF" />
                  ) : availableMenulines.length > 0 ? (
                     <View style={styles.menuList}>
                        {availableMenulines.map(menu => {
                           const isSelected = selectedMeal?.menuline_id === menu.menuline_id && !selectedMeal?.is_skipped;
                           return (
                              <View key={menu.id} style={[styles.menuCard, isSelected && styles.menuCardSelected]}>
                                 <TouchableOpacity 
                                    style={[styles.selectBtn, isSelected && styles.selectBtnSelected]}
                                    disabled={isSelected}
                                    onPress={() => handleSelectMenuline(menu)}
                                 >
                                    <Text style={[styles.selectBtnText, isSelected && styles.selectBtnTextSelected]}>
                                       {isSelected ? "Selected" : "Select"}
                                    </Text>
                                 </TouchableOpacity>
                                 
                                 <View style={styles.menuSection}>
                                    <Text style={styles.menuLabel}>Starter</Text>
                                    <Text style={styles.menuValue}>{menu.recipes_starter?.title || '-'}</Text>
                                 </View>
                                 <View style={styles.menuSection}>
                                    <Text style={styles.menuLabel}>Main Course</Text>
                                    <Text style={styles.menuValue}>{menu.recipes_main_course?.title || '-'}</Text>
                                 </View>
                                 <View style={styles.menuSection}>
                                    <Text style={styles.menuLabel}>Dessert</Text>
                                    <Text style={styles.menuValue}>{menu.recipes_dessert?.title || '-'}</Text>
                                 </View>
                              </View>
                           );
                        })}
                     </View>
                  ) : (
                     <Text style={styles.emptyText}>No menulines available for this date.</Text>
                  )}
               </ScrollView>
            </View>
         </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    overflow: 'hidden',
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerCellDate: {
    width: 90,
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  headerCellContent: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  headerCellAction: {
    width: 80,
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textAlign: 'right',
  },
  list: {
    paddingVertical: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    minHeight: 48,
  },
  colDate: {
    width: 90,
  },
  colContent: {
    flex: 1,
    paddingRight: 8,
  },
  colAction: {
    width: 80,
    alignItems: 'flex-end',
  },
  cellText: {
    fontSize: 13,
    color: '#333',
  },
  allergyText: {
    color: '#D32F2F',
  },
  skippedText: {
    color: '#999',
    fontStyle: 'italic',
    fontSize: 13,
  },
  badgeSkipped: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeTextSkipped: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '500',
  },
  detailsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 4,
  },
  detailsBtnText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
     flex: 1,
     backgroundColor: 'rgba(0,0,0,0.5)',
     justifyContent: 'center',
     alignItems: 'center',
     padding: 20,
  },
  modalContent: {
     backgroundColor: '#fff',
     width: '100%',
     maxWidth: 600,
     maxHeight: '80%',
     borderRadius: 12,
     overflow: 'hidden',
     shadowColor: "#000",
     shadowOffset: {width:0, height:4},
     shadowOpacity: 0.1,
     shadowRadius: 10,
     elevation: 5,
  },
  modalHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     padding: 16,
     borderBottomWidth: 1,
     borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
     fontSize: 18,
     fontWeight: '600',
     color: '#333',
  },
  modalBody: {
     padding: 16,
  },
  actionBtn: {
     paddingVertical: 8,
     paddingHorizontal: 16,
     borderRadius: 6,
     borderWidth: 1,
  },
  btnDanger: {
     borderColor: '#FECACA',
     backgroundColor: '#FEF2F2',
  },
  btnSuccess: {
     borderColor: '#E5E7EB',
     backgroundColor: '#F3F4F6',
  },
  actionBtnText: {
     fontWeight: '600',
     fontSize: 13,
  },
  textDanger: { color: '#DC2626' },
  textSuccess: { color: '#374151' },
  
  menuList: {
     gap: 16,
  },
  menuCard: {
     borderWidth: 1,
     borderColor: '#E5E5EA',
     borderRadius: 8,
     padding: 16,
     position: 'relative',
  },
  menuCardSelected: {
     borderColor: '#007AFF',
     backgroundColor: '#F0F9FF',
  },
  selectBtn: {
     position: 'absolute',
     top: 12,
     right: 12,
     zIndex: 1,
     paddingHorizontal: 12,
     paddingVertical: 6,
     borderRadius: 4,
     borderWidth: 1,
     borderColor: '#E5E5EA',
     backgroundColor: '#fff',
  },
  selectBtnSelected: {
     backgroundColor: '#007AFF',
     borderColor: '#007AFF',
  },
  selectBtnText: {
     fontSize: 12,
     fontWeight: '500',
     color: '#333',
  },
  selectBtnTextSelected: {
     color: '#fff',
  },
  menuSection: {
     marginBottom: 8,
  },
  menuLabel: {
     fontSize: 12,
     color: '#6B7280',
     fontWeight: '600',
     marginBottom: 2,
  },
  menuValue: {
     fontSize: 14,
     color: '#111827',
  },
});
