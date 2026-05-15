import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface NotesRendererProps {
  ncgJson: any;
}

const NotesRenderer: React.FC<NotesRendererProps> = ({ ncgJson }) => {
  if (!ncgJson) return null;

  return (
    <View style={styles.container}>
      {/* Overview */}
      <Text style={styles.sectionHeading}>Session Overview</Text>
      <Text style={styles.contentText}>
        {Array.isArray(ncgJson.session_overview) 
          ? ncgJson.session_overview.join('\n') 
          : String(ncgJson.session_overview || '')}
      </Text>

      {/* Topics Covered */}
      {ncgJson.topics_covered && (
        <>
          <Text style={[styles.sectionHeading, { marginTop: 25 }]}>Topics Covered</Text>
          {Array.isArray(ncgJson.topics_covered) ? (
            ncgJson.topics_covered.map((topic: any, index: number) => {
              const topicName = typeof topic === 'string' ? topic : (topic.name || '');
              const cleanTopic = topicName.replace(/^\d+(\.\d+)*\s*/, '').trim();
              return (
                <View key={index} style={styles.topicRow}>
                  <View style={styles.bulletPoint} />
                  <Text style={styles.topicText}>{cleanTopic}</Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.topicText}>{String(ncgJson.topics_covered)}</Text>
          )}
        </>
      )}

      {/* Concept Notes */}
      {ncgJson.concept_notes && Array.isArray(ncgJson.concept_notes) && ncgJson.concept_notes.length > 0 && (
        <>
          <Text style={[styles.sectionHeading, { marginTop: 25 }]}>Concept Notes</Text>
          {ncgJson.concept_notes.map((concept: any, index: number) => (
            <View key={index} style={{ marginBottom: 15 }}>
              <Text style={[styles.contentText, { fontWeight: '700', color: '#284b63' }]}>• {concept.name || concept.concept}</Text>
              {concept.definition && <Text style={[styles.contentText, { marginLeft: 15, fontStyle: 'italic', fontSize: 14 }]}>{concept.definition}</Text>}
              {concept.explanation && <Text style={[styles.contentText, { marginLeft: 15, marginTop: 4 }]}>{concept.explanation}</Text>}
            </View>
          ))}
        </>
      )}

      {/* Key Takeaways */}
      {ncgJson.key_takeaways && (
        <>
          <Text style={[styles.sectionHeading, { marginTop: 25 }]}>Key Takeaways</Text>
          {Array.isArray(ncgJson.key_takeaways) ? (
            ncgJson.key_takeaways.map((item: string, index: number) => (
              <View key={index} style={styles.takeawayRow}>
                <Text style={styles.takeawayBullet}>•</Text>
                <Text style={styles.contentText}>{item}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.contentText}>{String(ncgJson.key_takeaways)}</Text>
          )}
        </>
      )}

      {/* Q&A Section */}
      {ncgJson.qa_section && Array.isArray(ncgJson.qa_section) && ncgJson.qa_section.length > 0 && (
        <>
          <Text style={[styles.sectionHeading, { marginTop: 25 }]}>Questions & Answers</Text>
          {ncgJson.qa_section.map((item: any, index: number) => (
            <View key={index} style={{ marginBottom: 15, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8 }}>
              <Text style={[styles.contentText, { fontWeight: '700' }]}>Q: {item.question}</Text>
              <Text style={[styles.contentText, { marginTop: 5, color: '#284b63' }]}>A: {item.answer}</Text>
            </View>
          ))}
        </>
      )}

      {/* Practice Work */}
      {ncgJson.practice_work && (
        <>
          <Text style={[styles.sectionHeading, { marginTop: 25 }]}>Practice Work</Text>
          <Text style={styles.contentText}>
            {Array.isArray(ncgJson.practice_work) 
              ? ncgJson.practice_work.join('\n\n') 
              : String(ncgJson.practice_work)}
          </Text>
        </>
      )}

      {/* Dynamic Fields */}
      {Object.entries(ncgJson).map(([key, value]) => {
        const knownKeys = [
          'session_title', 'session_details', 'session_overview', 
          'topics_covered', 'concept_notes', 'key_takeaways', 
          'qa_section', 'practice_work', 'prepared_by', 'date', 
          'title', 'full_content_edited', 'session_id'
        ];
        
        if (knownKeys.includes(key) || !value) return null;

        const label = key.replace(/_/g, ' ').toUpperCase();
        
        return (
          <View key={key} style={{ marginTop: 25 }}>
            <Text style={styles.sectionHeading}>{label}</Text>
            {Array.isArray(value) ? (
              value.map((item: any, i: number) => (
                <View key={i} style={styles.takeawayRow}>
                  <Text style={styles.takeawayBullet}>•</Text>
                  <Text style={styles.contentText}>
                    {typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.contentText}>
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 0,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#284b63',
    marginBottom: 12,
  },
  contentText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#353535',
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#284b63',
    marginRight: 10,
  },
  topicText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#353535',
  },
  takeawayRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  takeawayBullet: {
    fontSize: 18,
    color: '#284b63',
    marginRight: 10,
    marginTop: -2,
  },
});

export default NotesRenderer;
