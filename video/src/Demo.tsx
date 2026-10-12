import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';

const FPS = 30;
const SLIDES = [
  { file: '02-faces.png', title: 'Finds the face', text: 'BlazeFace + face mesh run on your phone. Nothing is uploaded.' },
  { file: '03-smooth.png', title: 'Smooth, keeping the pores', text: 'Edge-aware, skin-only, with 15% of the texture always kept.' },
  { file: '04-light.png', title: 'Light & colour', text: 'Linear-light exposure. Warmth never turns skin orange.' },
  { file: '05-reshape.png', title: 'Reshape', text: 'A thin-plate-spline warp that keeps backgrounds still.' },
  { file: '06-makeup.png', title: 'Makeup', text: 'Lip, blush and brows that keep your skin texture.' },
  { file: '07-filters.png', title: 'Filters', text: 'Eight looks that leave skin tones alone.' },
  { file: '08-compare.png', title: 'Always compare', text: 'Hold to see the original, or drag the split.' },
];
const SLIDE = 7 * FPS, TITLE = 5 * FPS, END = 8 * FPS;
export const TOTAL = TITLE + SLIDES.length * SLIDE + END;

const Fade = ({ children, len }: { children: React.ReactNode; len: number }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(f, [0, 8, len - 8, len], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{children}</AbsoluteFill>;
};
const bg = { background: '#0F1013', color: '#F2F2F0', fontFamily: 'system-ui, sans-serif' } as const;

export const Demo = () => (
  <AbsoluteFill style={bg}>
    <Sequence from={0} durationInFrames={TITLE}><Fade len={TITLE}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 120, fontWeight: 700 }}><span style={{ color: '#8F7CFF' }}>Dii</span> faceeditor</div>
        <div style={{ fontSize: 48, marginTop: 40, color: '#A3A7B0' }}>A portrait retouching app, built entirely by AI.<br />$0 spent. Runs on your device.</div>
      </AbsoluteFill></Fade></Sequence>
    {SLIDES.map((s, i) => (
      <Sequence key={s.file} from={TITLE + i * SLIDE} durationInFrames={SLIDE}><Fade len={SLIDE}>
        <AbsoluteFill>
          <Img src={staticFile(`shots/${s.file}`)} style={{ position: 'absolute', top: 20, left: 0, width: 1080, height: 2338, transform: 'scale(0.64)', transformOrigin: 'top center', borderRadius: 24 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '60px 60px 90px', background: 'linear-gradient(transparent, #0F1013 40%)' }}>
            <div style={{ fontSize: 76, fontWeight: 700 }}>{s.title}</div>
            <div style={{ fontSize: 44, color: '#A3A7B0', marginTop: 16 }}>{s.text}</div>
          </div>
        </AbsoluteFill></Fade></Sequence>
    ))}
    <Sequence from={TITLE + SLIDES.length * SLIDE} durationInFrames={END}><Fade len={END}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 80, fontWeight: 700 }}>Try it</div>
        <div style={{ fontSize: 50, marginTop: 30, color: '#8F7CFF' }}>diizwe.github.io/dii-faceeditor</div>
        <div style={{ fontSize: 36, marginTop: 60, color: '#A3A7B0' }}>Open source, MIT. Photo: Mostafameraji, CC0 (Wikimedia Commons).</div>
      </AbsoluteFill></Fade></Sequence>
  </AbsoluteFill>
);
