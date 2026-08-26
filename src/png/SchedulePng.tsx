import type { PdfModel } from '../pdf/model';
import { COLORS, eventTint } from '../pdf/palette';

export function SchedulePng({ model }: { model: PdfModel }) {
  // Bảng màu cố định sáng dùng chung cho in PDF và xuất PNG.
  // Style inline vì html2canvas-pro bắt tốt nhất từ style thật thay vì
  // CSS biến thể (tailwind v4 biến, etc).

  return (
    <div
      style={{
        width: '1123px', // A4 Landscape
        padding: '37px 37px', // ~28pt padding
        backgroundColor: '#ffffff',
        color: COLORS.body,
        fontFamily: 'sans-serif',
        fontSize: '11px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottom: `2px solid ${COLORS.ink}`,
          paddingBottom: '8px',
          marginBottom: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.ink }}>
            {model.appName}
          </div>
          <div style={{ fontSize: '12px', color: COLORS.muted, marginTop: '4px' }}>
            {model.rangeLabel}
          </div>
        </div>
        <div style={{ fontSize: '10px', color: COLORS.faint }}>
          {model.exportedLabel}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          border: `1px solid ${COLORS.line}`,
        }}
      >
        {/* Head Row */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            backgroundColor: COLORS.headerBg,
            borderBottom: `1px solid ${COLORS.line}`,
          }}
        >
          <div
            style={{
              width: '75px', // ~56pt
              padding: '4px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: `1px solid ${COLORS.line}`,
            }}
          >
            <span
              style={{
                fontSize: '9px',
                fontWeight: 'bold',
                color: COLORS.faint,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {model.bandLabel}
            </span>
          </div>
          {model.columns.map((column, idx) => (
            <div
              key={column.date}
              style={{
                flex: 1,
                padding: '4px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: idx < model.columns.length - 1 ? `1px solid ${COLORS.line}` : 'none',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: COLORS.ink }}>
                {column.weekday}
              </div>
              <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '2px' }}>
                {column.dayLabel}
              </div>
            </div>
          ))}
        </div>

        {/* 3 Band Rows */}
        {[0, 1, 2].map((bandIndex) => {
          const isLastBand = bandIndex === 2;
          const bandLabel = model.columns[0]?.bands[bandIndex]?.label ?? '';

          const hasEvents = model.columns.some((c) => c.bands[bandIndex].events.length > 0);
          if (!hasEvents) return null;

          return (
            <div
              key={bandIndex}
              style={{
                display: 'flex',
                width: '100%',
                flex: 1,
                borderBottom: !isLastBand ? `1px solid ${COLORS.line}` : 'none',
                minHeight: '80px',
              }}
            >
              <div
                style={{
                  width: '75px',
                  padding: '4px',
                  borderRight: `1px solid ${COLORS.line}`,
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 'bold',
                    color: COLORS.faint,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {bandLabel}
                </span>
              </div>
              {model.columns.map((column, colIdx) => (
                <div
                  key={column.date}
                  style={{
                    flex: 1,
                    padding: '4px',
                    borderRight: colIdx < model.columns.length - 1 ? `1px solid ${COLORS.line}` : 'none',
                  }}
                >
                  {column.bands[bandIndex].events.map((event) => (
                    <div
                      key={event.key}
                      style={{
                        border: `2px solid ${event.color}`,
                        backgroundColor: eventTint(event.color),
                        borderRadius: '3px',
                        padding: '3px 4px',
                        marginBottom: '4px',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 'bold', color: COLORS.ink }}>
                        {event.time}
                        {event.mark ? ` ${event.mark}` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: COLORS.ink, marginTop: '1px' }}>
                        {event.title}
                      </div>
                      {!!event.categoryName && (
                        <div style={{ fontSize: '9px', color: COLORS.muted, marginTop: '1px' }}>
                          {event.categoryName}
                        </div>
                      )}
                      {!!event.location && (
                        <div style={{ fontSize: '9px', color: COLORS.muted, marginTop: '1px' }}>
                          {event.location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          borderTop: `1px solid ${COLORS.line}`,
          paddingTop: '8px',
          marginTop: '12px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: COLORS.ink, marginRight: '16px' }}>
          {model.summary.label}
        </span>

        <span style={{ fontSize: '11px', color: COLORS.body, marginRight: '16px' }}>
          {model.summary.plannedLabel}:{' '}
          <strong style={{ color: COLORS.ink }}>{model.summary.plannedValue}</strong>
        </span>

        <span style={{ fontSize: '11px', color: COLORS.body, marginRight: '16px' }}>
          {model.summary.completedLabel}:{' '}
          <strong style={{ color: COLORS.ink }}>{model.summary.completedValue}</strong>
        </span>

        {model.summary.incomeLabel && (
          <span style={{ fontSize: '11px', color: COLORS.body, marginRight: '16px' }}>
            {model.summary.incomeLabel}:{' '}
            <strong style={{ color: COLORS.ink }}>{model.summary.incomeValue}</strong>
            {model.summary.incomeNote && (
              <span style={{ fontSize: '9px', color: COLORS.faint }}> ({model.summary.incomeNote})</span>
            )}
          </span>
        )}

        {model.legend.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
            {model.legend.map((item) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: item.color,
                    marginRight: '4px',
                  }}
                />
                <span style={{ fontSize: '10px', color: COLORS.muted }}>{item.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
