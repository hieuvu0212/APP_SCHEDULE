// ═══════════════════════════════════════════════════════════════════════════
//  pdf/SchedulePdf.tsx — tài liệu PDF của lịch tuần
//
//  Thuần trình bày. Mọi chuỗi đã dịch và mọi số đã định dạng đến từ `PdfModel`
//  (xem pdf/model.ts) — component này KHÔNG gọi useTranslation, vì nó render
//  trong cây riêng của @react-pdf, ngoài Provider của i18next.
//
//  ⚠️ Đây KHÔNG phải HTML. `View` và `Text` là nguyên hàm của @react-pdf với
//  một tập con flexbox riêng. Không có `div`, không có class, không có
//  Tailwind. Mọi kiểu nằm ở pdf/pdfStyles.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { PdfModel } from './model';
import { eventTint, styles } from './pdfStyles';

export function SchedulePdf({
  model,
  fontFamily,
}: {
  model: PdfModel;
  /**
   * Họ font do pdf/fonts.ts chọn theo nội dung: bộ Latin cho lịch thường, bộ
   * CJK khi có chữ Hán. Đặt ở `Page` là đủ vì `fontFamily` được kế thừa
   * xuống mọi `Text` bên dưới.
   */
  fontFamily: string;
}) {
  return (
    <Document title={`${model.appName} — ${model.rangeLabel}`}>
      <Page
        size="A4"
        orientation="landscape"
        style={[styles.page, { fontFamily }]}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>{model.appName}</Text>
            <Text style={styles.rangeLabel}>{model.rangeLabel}</Text>
          </View>
          <Text style={styles.exportedLabel}>{model.exportedLabel}</Text>
        </View>

        <View style={styles.grid}>
          {model.columns.map((column) => (
            <View key={column.date} style={styles.column}>
              <View style={styles.columnHead}>
                <Text style={styles.weekday}>{column.weekday}</Text>
                <Text style={styles.dayLabel}>{column.dayLabel}</Text>
              </View>

              <View style={styles.columnBody}>
                {column.events.length === 0 ? (
                  <Text style={styles.emptyDay}>—</Text>
                ) : (
                  // Chia Sáng/Chiều/Tối. Bốn ca liền nhau in ra thành một cột
                  // chữ dài không có mốc nào để mắt bám vào; nhãn buổi trả lại
                  // cấu trúc mà bố cục in đã phải bỏ trục thời gian đi.
                  column.bands
                    .filter((band) => band.events.length > 0)
                    .map((band) => (
                      <View key={band.label} wrap={false}>
                        <Text style={styles.bandLabel}>{band.label}</Text>
                        {band.events.map((event) => (
                          <View
                            key={event.key}
                            style={[
                              styles.event,
                              {
                                borderLeftColor: event.color,
                                backgroundColor: eventTint(event.color),
                              },
                            ]}
                          >
                            <Text style={styles.eventTime}>
                              {event.time}
                              {event.mark ? ` ${event.mark}` : ''}
                            </Text>
                            <Text style={styles.eventTitle}>{event.title}</Text>
                            {!!event.categoryName && (
                              <Text style={styles.eventMeta}>{event.categoryName}</Text>
                            )}
                            {!!event.location && (
                              <Text style={styles.eventMeta}>{event.location}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    ))
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.summaryTitle}>{model.summary.label}</Text>

          <Text style={styles.summaryItem}>
            {model.summary.plannedLabel}:{' '}
            <Text style={styles.summaryValue}>{model.summary.plannedValue}</Text>
          </Text>

          <Text style={styles.summaryItem}>
            {model.summary.completedLabel}:{' '}
            <Text style={styles.summaryValue}>{model.summary.completedValue}</Text>
          </Text>

          {model.summary.incomeLabel && (
            <Text style={styles.summaryItem}>
              {model.summary.incomeLabel}:{' '}
              <Text style={styles.summaryValue}>{model.summary.incomeValue}</Text>
              {model.summary.incomeNote ? (
                <Text style={styles.summaryNote}> ({model.summary.incomeNote})</Text>
              ) : null}
            </Text>
          )}

          {model.legend.length > 0 && (
            <View style={styles.legend}>
              {model.legend.map((item) => (
                <View key={item.name} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
