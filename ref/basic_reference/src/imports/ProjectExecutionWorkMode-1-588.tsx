import svgPaths from "./svg-ftzvwnodza";
import imgAb6AXuAc9QrD3YRaBEyLvZwMQe8NX6JHgUfj1TereyCobPhwmhDSdr04Zb3XvYEoUlK3OxjkouaEmcSmibV6LU0EUrBaIu5HhSs8Fu6DOljx5TsSxmAb7MqRqW4Svn7K1BAZie5So9UFVlgUs5J62MkHxqPaL25ESd8VlTkAcEsV4YUe29Ps4Q2EPOtVhQnIaFk6WXsKlHiQcGhpMbQelkKiR6Wnx7ZEk5TYxtrmb0SH9A4OZy8WeL95XIvkCjbsCagYtJu5L3I from "figma:asset/7bf254fbdaea5ac2de93c7e7e8d2f739736bb40d.png";
import imgAb6AXuBq1FjRfakJ54XcS0O1NkR0S5M4FbBlPgDgPvp2DoP4BsHjNx3UuaBRoo2JP3ZiwCzHq3GdH7QrGzq5V5Y7UidAJtcq7CCETZk9EHiBv0W7Ia2UgpQwxncjytuW3ArzBs4ALvHSenTfhM2WtlXtajUn4UNBjPsZ3Cgzo0Rlrzc4NmXhN83C33J4PbfZu8FsZ3T5LeI3XYwnQCwMdpnSfA5Y4ZIHtgurUwZe1Bb5O96GugxYYjfBWoC7Ts8G8XAhqVwRrcg from "figma:asset/2fa1682fb263d6323f1db28f18cdccf9a587eb97.png";

function Container1() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 9.33333">
        <g id="Container">
          <path d={svgPaths.p3cc66d00} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center relative">
        <Container1 />
        <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[10px] w-[90.02px]">
          <p className="leading-[15px]">TERMINAL v3.2.1</p>
        </div>
      </div>
    </div>
  );
}

function Container2() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-start relative">
        <div className="bg-[rgba(255,180,171,0.4)] rounded-[12px] shrink-0 size-[10px]" data-name="Overlay" />
        <div className="bg-[rgba(255,183,124,0.4)] rounded-[12px] shrink-0 size-[10px]" data-name="Overlay" />
        <div className="bg-[rgba(161,201,255,0.4)] rounded-[12px] shrink-0 size-[10px]" data-name="Overlay" />
      </div>
    </div>
  );
}

function BackgroundHorizontalBorder() {
  return (
    <div className="bg-[#1a1b1e] h-[32px] relative shrink-0 w-full" data-name="Background+HorizontalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(64,71,82,0.05)] border-b border-solid inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between pb-px px-[12px] relative size-full">
          <Container />
          <Container2 />
        </div>
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[16px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[259.25px]">
        <p className="leading-[18px]">Initializing Monolith environment...</p>
      </div>
    </div>
  );
}

function Container5() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[38px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[244.86px]">
        <p>
          <span className="leading-[18px]">{`Connected to `}</span>
          <span className="font-['ABeeZee:Regular',sans-serif] leading-[18px] not-italic text-[#a1c9ff]">node-01.alpha-cluster</span>
        </p>
      </div>
    </div>
  );
}

function Container6() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[60px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[36px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[237.66px]">
        <p className="mb-0">
          <span className="leading-[18px]">{`Loading model weights: `}</span>
          <span className="font-['ABeeZee:Regular',sans-serif] leading-[18px] not-italic text-[#ffb77c]">BERT-base-</span>
        </p>
        <p>
          <span className="font-['ABeeZee:Regular',sans-serif] leading-[18px] not-italic text-[#ffb77c]">uncased</span>
          <span className="leading-[18px]">... DONE</span>
        </p>
      </div>
    </div>
  );
}

function Container7() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] pt-[8px] right-[16px] top-[100px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[36px] justify-center leading-[18px] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[172.83px]">
        <p className="mb-0">[INFO] Server started at</p>
        <p>{`http://localhost:8080`}</p>
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[148px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[288.05px]">
        <p className="leading-[18px]">[WARN] High latency detected on socket 4</p>
      </div>
    </div>
  );
}

function Container9() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] pt-[8px] right-[16px] top-[170px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[36px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[12px] text-shadow-[0px_0px_5px_rgba(161,201,255,0.3)] w-[237.66px]">
        <p className="mb-0">
          <span className="leading-[18px]">{`monolith@alpha:~/analysis$ `}</span>
          <span className="font-['ABeeZee:Regular',sans-serif] leading-[18px] not-italic text-[#e3e2e6]">python</span>
        </p>
        <p className="leading-[18px] text-[#e3e2e6]">run_inference.py --debug</p>
      </div>
    </div>
  );
}

function Container10() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[218px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[259.25px]">
        <p className="leading-[18px]">-- Fetching data from source... 100%</p>
      </div>
    </div>
  );
}

function Container11() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[240px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[180.03px]">
        <p className="leading-[18px]">-- Normalizing tensors...</p>
      </div>
    </div>
  );
}

function Container12() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[16px] right-[16px] top-[262px]" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[36px] justify-center leading-[18px] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[237.64px]">
        <p className="mb-0">-- Running batch prediction (1024</p>
        <p>samples)</p>
      </div>
    </div>
  );
}

function Container14() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[12px] w-[86.42px]">
        <p className="leading-[18px]">[####------]</p>
      </div>
    </div>
  );
}

function Container15() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[18px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[12px] w-[36.02px]">
        <p className="leading-[18px]">42.4%</p>
      </div>
    </div>
  );
}

function Container13() {
  return (
    <div className="absolute content-stretch flex gap-[8px] h-[26px] items-start left-[16px] py-[4px] right-[16px] top-[302px]" data-name="Container">
      <Container14 />
      <Container15 />
    </div>
  );
}

function Container3() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid overflow-clip relative rounded-[inherit] size-full">
        <Container4 />
        <Container5 />
        <Container6 />
        <Container7 />
        <Container8 />
        <Container9 />
        <Container10 />
        <Container11 />
        <Container12 />
        <Container13 />
        <div className="absolute bg-[#a1c9ff] h-[16px] left-[20px] top-[332px] w-[6px]" data-name="Background" />
      </div>
    </div>
  );
}

function SectionLeftPaneTerminal() {
  return (
    <div className="bg-[#0d0e11] content-stretch flex flex-col h-full items-start pr-px relative shrink-0 w-[332px]" data-name="Section - LEFT PANE: TERMINAL">
      <div aria-hidden="true" className="absolute border-[rgba(64,71,82,0.1)] border-r border-solid inset-0 pointer-events-none" />
      <BackgroundHorizontalBorder />
      <Container3 />
    </div>
  );
}

function Container16() {
  return (
    <div className="h-[10.5px] relative shrink-0 w-[8px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8 10.5">
        <g id="Container">
          <path d={svgPaths.p3e41e180} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container17() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit]">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[17px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[11px] w-[324.03px]">
          <p className="leading-[16.5px]">{`https://monolith.internal/workspace-alpha/analysis/dashboard`}</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="bg-[#0d0e11] max-w-[448px] relative rounded-[2px] shrink-0 w-[448px]" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[2px]" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center max-w-[inherit] px-[9px] py-[3px] relative w-full">
        <Container16 />
        <Container17 />
      </div>
    </div>
  );
}

function Button() {
  return (
    <div className="relative shrink-0 size-[10.667px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 10.6667 10.6667">
        <g id="Button">
          <path d={svgPaths.p3b5913c0} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button1() {
  return (
    <div className="relative shrink-0 size-[12px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12 12">
        <g id="Button">
          <path d={svgPaths.p1a4a78c0} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container18() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center relative">
        <Button />
        <Button1 />
      </div>
    </div>
  );
}

function BackgroundHorizontalBorder1() {
  return (
    <div className="bg-[#1a1b1e] h-[32px] relative shrink-0 w-full" data-name="Background+HorizontalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(64,71,82,0.05)] border-b border-solid inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[16px] items-center pb-px px-[12px] relative size-full">
          <BackgroundBorder />
          <Container18 />
        </div>
      </div>
    </div>
  );
}

function Heading1() {
  return (
    <div className="relative shrink-0 w-full" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[#c0c7d4] text-[12px] tracking-[0.6px] w-full">
          <p className="leading-[16px]">PRECISION SCORE</p>
        </div>
      </div>
    </div>
  );
}

function Container21() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[36px] justify-center leading-[0] relative shrink-0 text-[#a1c9ff] text-[30px] w-[83.41px]">
        <p className="leading-[36px]">0.942</p>
      </div>
    </div>
  );
}

function Margin() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[4px] relative shrink-0" data-name="Margin">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#ffb77c] text-[10px] w-[31.55px]">
        <p className="leading-[15px]">+2.4%</p>
      </div>
    </div>
  );
}

function Container20() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-end relative w-full">
        <Container21 />
        <Margin />
      </div>
    </div>
  );
}

function StatsCard() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(26,27,30,0.8)] col-[1/span_4] justify-self-stretch relative rounded-[4px] row-1 self-start shrink-0" data-name="Stats Card 1">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[4px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" />
      <div className="content-stretch flex flex-col gap-[8px] items-start p-[17px] relative w-full">
        <Heading1 />
        <Container20 />
      </div>
    </div>
  );
}

function Heading2() {
  return (
    <div className="relative shrink-0 w-full" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[#c0c7d4] text-[12px] tracking-[0.6px] w-full">
          <p className="leading-[16px]">INFERENCE SPEED</p>
        </div>
      </div>
    </div>
  );
}

function Container23() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[36px] justify-center leading-[0] relative shrink-0 text-[#a1c9ff] text-[30px] w-[72.73px]">
        <p className="leading-[36px]">12ms</p>
      </div>
    </div>
  );
}

function Margin1() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[4px] relative shrink-0" data-name="Margin">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[10px] w-[37.09px]">
        <p className="leading-[15px]">STABLE</p>
      </div>
    </div>
  );
}

function Container22() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-end relative w-full">
        <Container23 />
        <Margin1 />
      </div>
    </div>
  );
}

function StatsCard1() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(26,27,30,0.8)] col-[5/span_4] justify-self-stretch relative rounded-[4px] row-1 self-start shrink-0" data-name="Stats Card 2">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[4px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" />
      <div className="content-stretch flex flex-col gap-[8px] items-start p-[17px] relative w-full">
        <Heading2 />
        <Container22 />
      </div>
    </div>
  );
}

function Heading3() {
  return (
    <div className="relative shrink-0 w-full" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[#c0c7d4] text-[12px] tracking-[0.6px] w-full">
          <p className="leading-[16px]">ACTIVE SESSIONS</p>
        </div>
      </div>
    </div>
  );
}

function Container25() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[36px] justify-center leading-[0] relative shrink-0 text-[#a1c9ff] text-[30px] w-[78.91px]">
        <p className="leading-[36px]">1,408</p>
      </div>
    </div>
  );
}

function Margin2() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[4px] relative shrink-0" data-name="Margin">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[10px] w-[39.58px]">
        <p className="leading-[15px]">GLOBAL</p>
      </div>
    </div>
  );
}

function Container24() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[7.99px] items-end relative w-full">
        <Container25 />
        <Margin2 />
      </div>
    </div>
  );
}

function StatsCard2() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(26,27,30,0.8)] col-[9/span_4] justify-self-stretch relative rounded-[4px] row-1 self-start shrink-0" data-name="Stats Card 3">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[4px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" />
      <div className="content-stretch flex flex-col gap-[8px] items-start p-[17px] relative w-full">
        <Heading3 />
        <Container24 />
      </div>
    </div>
  );
}

function Heading4() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Heading 3">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[#e3e2e6] text-[14px] w-[178.14px]">
        <p className="leading-[20px]">Training Loss vs Validation</p>
      </div>
    </div>
  );
}

function Container28() {
  return (
    <div className="relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[4px] h-full items-center pb-px relative">
          <div className="bg-[#a1c9ff] rounded-[12px] shrink-0 size-[8px]" data-name="Background" />
          <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#e3e2e6] text-[10px] uppercase w-[31.14px]">
            <p className="leading-[15px]">Train</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Container29() {
  return (
    <div className="relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[4px] h-full items-center pb-px relative">
          <div className="bg-[#ffb77c] rounded-[12px] shrink-0 size-[8px]" data-name="Background" />
          <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#e3e2e6] text-[10px] uppercase w-[60.8px]">
            <p className="leading-[15px]">Validation</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Container27() {
  return (
    <div className="content-stretch flex gap-[16px] h-[16px] items-start relative shrink-0" data-name="Container">
      <Container28 />
      <Container29 />
    </div>
  );
}

function Container26() {
  return (
    <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-name="Container">
      <Heading4 />
      <Container27 />
    </div>
  );
}

function Margin3() {
  return (
    <div className="relative shrink-0 w-full" data-name="Margin">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[24px] relative w-full">
        <Container26 />
      </div>
    </div>
  );
}

function Ab6AXuAc9QrD3YRaBEyLvZwMQe8NX6JHgUfj1TereyCobPhwmhDSdr04Zb3XvYEoUlK3OxjkouaEmcSmibV6LU0EUrBaIu5HhSs8Fu6DOljx5TsSxmAb7MqRqW4Svn7K1BAZie5So9UFVlgUs5J62MkHxqPaL25ESd8VlTkAcEsV4YUe29Ps4Q2EPOtVhQnIaFk6WXsKlHiQcGhpMbQelkKiR6Wnx7ZEk5TYxtrmb0SH9A4OZy8WeL95XIvkCjbsCagYtJu5L3I() {
  return (
    <div className="h-[355.33px] mix-blend-screen opacity-40 relative rounded-[2px] shrink-0 w-full" data-name="AB6AXuAC9QrD3yRaBEyLvZwMQe8nX6JHgUfj1tereyCobPhwmhDSdr04ZB3XvYEoUlK3OxjkouaEmcSmibV6lU0EUrBaIU5HHSs8Fu6dOLJX5tsSXMAb7MQRq-w4Svn_7k1bAZie5SO9uFVlgUs5J62mkHXQPaL-25ESd8VLTkAcES_V4yUe29PS4Q2E-pOtVHQnIA_FK6WXsKLHiQc-GhpMbQelkKiR6WNX7zEk5tYxtrmb0sH9a4oZY8WeL9-5XIvkCJBSCagYtJU5L3I">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[2px]">
        <div className="absolute inset-0 overflow-hidden rounded-[2px]">
          <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgAb6AXuAc9QrD3YRaBEyLvZwMQe8NX6JHgUfj1TereyCobPhwmhDSdr04Zb3XvYEoUlK3OxjkouaEmcSmibV6LU0EUrBaIu5HhSs8Fu6DOljx5TsSxmAb7MqRqW4Svn7K1BAZie5So9UFVlgUs5J62MkHxqPaL25ESd8VlTkAcEsV4YUe29Ps4Q2EPOtVhQnIaFk6WXsKlHiQcGhpMbQelkKiR6Wnx7ZEk5TYxtrmb0SH9A4OZy8WeL95XIvkCjbsCagYtJu5L3I} />
        </div>
        <div className="absolute bg-white inset-0 mix-blend-saturation rounded-[2px]" />
      </div>
    </div>
  );
}

function Container30() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative w-full">
        <Ab6AXuAc9QrD3YRaBEyLvZwMQe8NX6JHgUfj1TereyCobPhwmhDSdr04Zb3XvYEoUlK3OxjkouaEmcSmibV6LU0EUrBaIu5HhSs8Fu6DOljx5TsSxmAb7MqRqW4Svn7K1BAZie5So9UFVlgUs5J62MkHxqPaL25ESd8VlTkAcEsV4YUe29Ps4Q2EPOtVhQnIaFk6WXsKlHiQcGhpMbQelkKiR6Wnx7ZEk5TYxtrmb0SH9A4OZy8WeL95XIvkCjbsCagYtJu5L3I />
        <div className="absolute bg-[rgba(161,201,255,0.2)] h-px left-0 top-[88.83px] w-[355.33px]" data-name="Horizontal Divider" />
        <div className="-translate-y-1/2 absolute bg-[rgba(161,201,255,0.2)] h-px left-0 top-[calc(50%+0.5px)] w-[355.33px]" data-name="Horizontal Divider" />
        <div className="absolute bg-[rgba(161,201,255,0.2)] h-px left-0 top-[266.48px] w-[355.33px]" data-name="Horizontal Divider" />
      </div>
    </div>
  );
}

function LargeChartPlaceholder() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(26,27,30,0.8)] col-[1/span_8] justify-self-stretch min-h-[300px] relative rounded-[4px] row-2 self-start shrink-0" data-name="Large Chart Placeholder">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[4px]" />
      <div className="content-stretch flex flex-col items-start min-h-[inherit] p-[25px] relative w-full">
        <Margin3 />
        <Container30 />
      </div>
    </div>
  );
}

function Heading5() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 3">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#e3e2e6] text-[14px] w-full">
        <p className="leading-[20px]">Latest Logs</p>
      </div>
    </div>
  );
}

function Heading3Margin() {
  return (
    <div className="relative shrink-0 w-full" data-name="Heading 3:margin">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[16px] relative w-full">
        <Heading5 />
      </div>
    </div>
  );
}

function Margin4() {
  return (
    <div className="content-stretch flex flex-col h-[12px] items-start pt-[6px] relative shrink-0 w-[6px]" data-name="Margin">
      <div className="bg-[#a1c9ff] rounded-[12px] shrink-0 size-[6px]" data-name="Background" />
    </div>
  );
}

function Container34() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[16.5px] not-italic relative shrink-0 text-[#e3e2e6] text-[11px] w-full">
        <p className="mb-0">{`User 'admin' updated`}</p>
        <p>hyperparameters</p>
      </div>
    </div>
  );
}

function Container35() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[10px] w-full">
        <p className="leading-[15px]">2 mins ago</p>
      </div>
    </div>
  );
}

function Container33() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-h-px min-w-px relative" data-name="Container">
      <Container34 />
      <Container35 />
    </div>
  );
}

function Container32() {
  return (
    <div className="relative rounded-[2px] shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex gap-[12px] items-start p-[8px] relative w-full">
        <Margin4 />
        <Container33 />
      </div>
    </div>
  );
}

function Margin5() {
  return (
    <div className="content-stretch flex flex-col h-[12px] items-start pt-[6px] relative shrink-0 w-[6px]" data-name="Margin">
      <div className="bg-[#ffb77c] rounded-[12px] shrink-0 size-[6px]" data-name="Background" />
    </div>
  );
}

function Container38() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[16.5px] not-italic relative shrink-0 text-[#e3e2e6] text-[11px] w-full">
        <p className="mb-0">Automatic snapshot</p>
        <p>triggered</p>
      </div>
    </div>
  );
}

function Container39() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[10px] w-full">
        <p className="leading-[15px]">15 mins ago</p>
      </div>
    </div>
  );
}

function Container37() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-h-px min-w-px relative" data-name="Container">
      <Container38 />
      <Container39 />
    </div>
  );
}

function Container36() {
  return (
    <div className="relative rounded-[2px] shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex gap-[12px] items-start p-[8px] relative w-full">
        <Margin5 />
        <Container37 />
      </div>
    </div>
  );
}

function Margin6() {
  return (
    <div className="content-stretch flex flex-col h-[12px] items-start pt-[6px] relative shrink-0 w-[6px]" data-name="Margin">
      <div className="bg-[#ffb4ab] rounded-[12px] shrink-0 size-[6px]" data-name="Background" />
    </div>
  );
}

function Container42() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[16.5px] not-italic relative shrink-0 text-[#e3e2e6] text-[11px] w-full">
        <p className="mb-0">Database backup failed</p>
        <p>on node-02</p>
      </div>
    </div>
  );
}

function Container43() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[10px] w-full">
        <p className="leading-[15px]">1 hour ago</p>
      </div>
    </div>
  );
}

function Container41() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-h-px min-w-px relative" data-name="Container">
      <Container42 />
      <Container43 />
    </div>
  );
}

function Container40() {
  return (
    <div className="relative rounded-[2px] shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex gap-[12px] items-start p-[8px] relative w-full">
        <Margin6 />
        <Container41 />
      </div>
    </div>
  );
}

function Container31() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[12px] items-start relative w-full">
        <Container32 />
        <Container36 />
        <Container40 />
      </div>
    </div>
  );
}

function Button2() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center px-[38.67px] py-[8px] relative shrink-0" data-name="Button">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[10px] text-center uppercase w-[83.33px]">
        <p className="leading-[15px]">Export report</p>
      </div>
    </div>
  );
}

function ButtonMargin() {
  return (
    <div className="h-[163.328px] min-h-[31px] relative shrink-0" data-name="Button:margin">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col h-full items-start justify-end min-h-[inherit] pt-[132.328px] relative">
        <Button2 />
      </div>
    </div>
  );
}

function DataList() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(26,27,30,0.8)] col-[9/span_4] justify-self-stretch relative rounded-[4px] row-2 self-start shrink-0" data-name="Data List">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[4px]" />
      <div className="content-stretch flex flex-col items-start justify-between p-[17px] relative w-full">
        <Heading3Margin />
        <Container31 />
        <ButtonMargin />
      </div>
    </div>
  );
}

function Container19() {
  return (
    <div className="gap-x-[16px] gap-y-[16px] grid grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-[__94px_449.33px] relative shrink-0 w-full" data-name="Container">
      <StatsCard />
      <StatsCard1 />
      <StatsCard2 />
      <LargeChartPlaceholder />
      <DataList />
    </div>
  );
}

function DashboardContent() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Dashboard Content" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg viewBox=\\'0 0 664 924\\' xmlns=\\'http://www.w3.org/2000/svg\\' preserveAspectRatio=\\'none\\'><rect x=\\'0\\' y=\\'0\\' height=\\'100%\\' width=\\'100%\\' fill=\\'url(%23grad)\\' opacity=\\'1\\'/><defs><radialGradient id=\\'grad\\' gradientUnits=\\'userSpaceOnUse\\' cx=\\'0\\' cy=\\'0\\' r=\\'10\\' gradientTransform=\\'matrix(46.952 0 0 65.337 332 462)\\'><stop stop-color=\\'rgba(64,71,82,1)\\' offset=\\'0.035355\\'/><stop stop-color=\\'rgba(64,71,82,0)\\' offset=\\'0.035355\\'/></radialGradient></defs></svg>')" }}>
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col items-start p-[24px] relative size-full">
          <Container19 />
        </div>
      </div>
    </div>
  );
}

function SectionRightPaneBrowserDashboard() {
  return (
    <div className="bg-[#121316] content-stretch flex flex-col h-full items-start relative shrink-0 w-[664px]" data-name="Section - RIGHT PANE: BROWSER / DASHBOARD">
      <BackgroundHorizontalBorder1 />
      <DashboardContent />
    </div>
  );
}

function MainMainWorkspaceContent() {
  return (
    <div className="absolute content-stretch flex inset-[40px_0_28px_284px] items-start overflow-clip" data-name="Main - MAIN WORKSPACE CONTENT">
      <SectionLeftPaneTerminal />
      <SectionRightPaneBrowserDashboard />
    </div>
  );
}

function Container45() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[14px] w-[118.06px]">
        <p className="leading-[20px]">Workspace Alpha</p>
      </div>
    </div>
  );
}

function Container46() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Light',sans-serif] font-light h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#404752] text-[14px] w-[4.88px]">
        <p className="leading-[20px]">/</p>
      </div>
    </div>
  );
}

function Container47() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[14px] w-[56.59px]">
        <p className="leading-[20px]">Analysis</p>
      </div>
    </div>
  );
}

function Container44() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center relative">
        <Container45 />
        <Container46 />
        <Container47 />
      </div>
    </div>
  );
}

function Link() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[9px] pt-[8px] relative shrink-0" data-name="Link">
      <div aria-hidden="true" className="absolute border-[#a1c9ff] border-b border-solid inset-0 pointer-events-none" />
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[13px] w-[98.92px]">
        <p className="leading-[19.5px]">Execution Mode</p>
      </div>
    </div>
  );
}

function Link1() {
  return (
    <div className="content-stretch flex flex-col items-start py-[8px] relative shrink-0" data-name="Link">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[13px] w-[81.36px]">
        <p className="leading-[19.5px]">Design Mode</p>
      </div>
    </div>
  );
}

function Container49() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Container">
      <Link />
      <Link1 />
    </div>
  );
}

function Container51() {
  return (
    <div className="h-[15px] relative shrink-0 w-[12px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12 15">
        <g id="Container">
          <path d={svgPaths.p29d21b80} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button3() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0" data-name="Button">
      <Container51 />
    </div>
  );
}

function Container52() {
  return (
    <div className="h-[13.5px] relative shrink-0 w-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 13.5">
        <g id="Container">
          <path d={svgPaths.p3d46dc00} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button4() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0" data-name="Button">
      <Container52 />
    </div>
  );
}

function Container53() {
  return (
    <div className="h-[12px] relative shrink-0 w-[3px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3 12">
        <g id="Container">
          <path d={svgPaths.p3575b450} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button5() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0" data-name="Button">
      <Container53 />
    </div>
  );
}

function Container50() {
  return (
    <div className="content-stretch flex gap-[12px] items-center relative shrink-0" data-name="Container">
      <Button3 />
      <Button4 />
      <Button5 />
    </div>
  );
}

function Container48() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[24px] items-center relative">
        <Container49 />
        <div className="bg-[rgba(64,71,82,0.2)] h-[16px] shrink-0 w-px" data-name="Vertical Divider" />
        <Container50 />
      </div>
    </div>
  );
}

function HeaderTopNavbar() {
  return (
    <div className="absolute bg-[#121316] content-stretch flex h-[40px] items-center justify-between left-[284px] pb-px px-[16px] right-0 top-0" data-name="Header - TOP NAVBAR">
      <div aria-hidden="true" className="absolute border-[rgba(64,71,82,0.15)] border-b border-solid inset-0 pointer-events-none" />
      <Container44 />
      <Container48 />
    </div>
  );
}

function Heading() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 2">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#c0c7d4] text-[11px] tracking-[1.1px] uppercase w-full">
        <p className="leading-[16.5px]">Active Project</p>
      </div>
    </div>
  );
}

function Container55() {
  return (
    <div className="content-stretch flex flex-col items-start overflow-clip relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#228be6] text-[14px] w-full">
        <p className="leading-[20px]">Workspace Alpha</p>
      </div>
    </div>
  );
}

function Container54() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex flex-col items-start px-[12px] relative w-full">
        <Heading />
        <Container55 />
      </div>
    </div>
  );
}

function Margin7() {
  return (
    <div className="relative shrink-0 w-full" data-name="Margin">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[24px] relative w-full">
        <Container54 />
      </div>
    </div>
  );
}

function Container56() {
  return (
    <div className="relative shrink-0 size-[13.5px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 13.5 13.5">
        <g id="Container">
          <path d={svgPaths.p6210b80} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container57() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[13px] w-[58.11px]">
        <p className="leading-[19.5px]">Overview</p>
      </div>
    </div>
  );
}

function Link2() {
  return (
    <div className="relative rounded-[4px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center pb-[8px] pt-[7px] px-[12px] relative w-full">
          <Container56 />
          <Container57 />
        </div>
      </div>
    </div>
  );
}

function Container58() {
  return (
    <div className="relative shrink-0 size-[13.5px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 13.5 13.5">
        <g id="Container">
          <path d={svgPaths.p19b00c10} fill="var(--fill-0, #228BE6)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container59() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#228be6] text-[13px] w-[53.73px]">
        <p className="leading-[19.5px]">Analysis</p>
      </div>
    </div>
  );
}

function Link3() {
  return (
    <div className="bg-[rgba(41,42,45,0.3)] relative rounded-[4px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center pb-[8px] pt-[7px] px-[12px] relative w-full">
          <Container58 />
          <Container59 />
        </div>
      </div>
    </div>
  );
}

function Container60() {
  return (
    <div className="h-[9px] relative shrink-0 w-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 9">
        <g id="Container">
          <path d={svgPaths.p1139c960} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container61() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[13px] w-[57.03px]">
        <p className="leading-[19.5px]">Modeling</p>
      </div>
    </div>
  );
}

function Link4() {
  return (
    <div className="relative rounded-[4px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center pb-[8px] pt-[7px] px-[12px] relative w-full">
          <Container60 />
          <Container61 />
        </div>
      </div>
    </div>
  );
}

function Container62() {
  return (
    <div className="h-[12px] relative shrink-0 w-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 12">
        <g id="Container">
          <path d={svgPaths.p1aebff60} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container63() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[13px] w-[39.31px]">
        <p className="leading-[19.5px]">Kernel</p>
      </div>
    </div>
  );
}

function Link5() {
  return (
    <div className="relative rounded-[4px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center pb-[8px] pt-[7px] px-[12px] relative w-full">
          <Container62 />
          <Container63 />
        </div>
      </div>
    </div>
  );
}

function Container64() {
  return (
    <div className="h-[12px] relative shrink-0 w-[16.5px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16.5 12">
        <g id="Container">
          <path d={svgPaths.p1931a200} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container65() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[13px] w-[93.44px]">
        <p className="leading-[19.5px]">Documentation</p>
      </div>
    </div>
  );
}

function Link6() {
  return (
    <div className="relative rounded-[4px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center pb-[8px] pt-[7px] px-[12px] relative w-full">
          <Container64 />
          <Container65 />
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <div className="relative shrink-0 w-full" data-name="Nav">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[4px] items-start relative w-full">
        <Link2 />
        <Link3 />
        <Link4 />
        <Link5 />
        <Link6 />
      </div>
    </div>
  );
}

function Container67() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#c0c7d4] text-[10px] w-[50.8px]">
        <p className="leading-[15px]">CPU LOAD</p>
      </div>
    </div>
  );
}

function Container68() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#a1c9ff] text-[10px] w-[18.02px]">
        <p className="leading-[15px]">24%</p>
      </div>
    </div>
  );
}

function Container66() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between relative w-full">
        <Container67 />
        <Container68 />
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="bg-[#343538] h-[4px] relative rounded-[12px] shrink-0 w-full" data-name="Background">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid overflow-clip relative rounded-[inherit] size-full">
        <div className="absolute bg-[#3294f0] inset-[0_76.01%_0_0]" data-name="Background" />
      </div>
    </div>
  );
}

function OverlayBorder() {
  return (
    <div className="bg-[rgba(26,27,30,0.5)] relative rounded-[4px] shrink-0 w-full" data-name="Overlay+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.1)] border-solid inset-0 pointer-events-none rounded-[4px]" />
      <div className="content-stretch flex flex-col gap-[8px] items-start px-[13px] py-[17px] relative w-full">
        <Container66 />
        <Background />
      </div>
    </div>
  );
}

function Margin8() {
  return (
    <div className="flex-[1_0_0] min-h-[61px] min-w-px relative w-full" data-name="Margin">
      <div className="flex flex-col justify-end min-h-[inherit] size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-end min-h-[inherit] pt-[677px] relative size-full">
          <OverlayBorder />
        </div>
      </div>
    </div>
  );
}

function AsideExpandedSidebarProjectTabs() {
  return (
    <div className="absolute bg-[#121316] content-stretch flex flex-col h-[1024px] items-start justify-between left-[64px] pl-[8px] pr-[9px] py-[16px] top-0 w-[220px]" data-name="Aside - EXPANDED SIDEBAR (Project Tabs)">
      <div aria-hidden="true" className="absolute border-[rgba(64,71,82,0.15)] border-r border-solid inset-0 pointer-events-none" />
      <Margin7 />
      <Nav />
      <Margin8 />
    </div>
  );
}

function Margin9() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[32px] relative shrink-0" data-name="Margin">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[#228be6] text-[20px] tracking-[-1px] w-[16.64px]">
        <p className="leading-[28px]">M</p>
      </div>
    </div>
  );
}

function Container69() {
  return (
    <div className="h-[16px] relative shrink-0 w-[21.5px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 21.5 16">
        <g id="Container">
          <path d={svgPaths.p34cd900} fill="var(--fill-0, #228BE6)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function ButtonActiveProjectIndicator() {
  return (
    <div className="bg-[#121316] content-stretch flex items-center justify-center pl-[2px] relative rounded-[4px] size-[40px]" data-name="Button - Active Project Indicator">
      <div aria-hidden="true" className="absolute border-[#228be6] border-l-2 border-solid inset-0 pointer-events-none rounded-[4px]" />
      <Container69 />
    </div>
  );
}

function Container70() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p4c2b800} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button6() {
  return (
    <div className="-translate-x-1/2 absolute content-stretch flex items-center justify-center left-1/2 opacity-50 rounded-[4px] size-[40px] top-[56px]" data-name="Button">
      <Container70 />
    </div>
  );
}

function Container71() {
  return (
    <div className="h-[19.05px] relative shrink-0 w-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 19.05">
        <g id="Container">
          <path d={svgPaths.p1104fd00} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button7() {
  return (
    <div className="-translate-x-1/2 absolute content-stretch flex items-center justify-center left-1/2 opacity-50 rounded-[4px] size-[40px] top-[112px]" data-name="Button">
      <Container71 />
    </div>
  );
}

function Container72() {
  return (
    <div className="h-[20px] relative shrink-0 w-[16px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 20">
        <g id="Container">
          <path d={svgPaths.pc679c40} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button8() {
  return (
    <div className="-translate-x-1/2 absolute content-stretch flex items-center justify-center left-1/2 opacity-50 rounded-[4px] size-[40px] top-[168px]" data-name="Button">
      <Container72 />
    </div>
  );
}

function Margin10() {
  return (
    <div className="absolute content-stretch flex flex-col h-[17px] items-start left-[16px] py-[8px] top-[224px] w-[32px]" data-name="Margin">
      <div className="bg-[rgba(64,71,82,0.1)] h-px shrink-0 w-[32px]" data-name="Horizontal Divider" />
    </div>
  );
}

function Container73() {
  return (
    <div className="h-[20px] relative shrink-0 w-[20.1px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20.1 20">
        <g id="Container">
          <path d={svgPaths.p3cdadd00} fill="var(--fill-0, #C0C7D4)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button9() {
  return (
    <div className="-translate-x-1/2 absolute content-stretch flex items-center justify-center left-1/2 opacity-50 rounded-[4px] size-[40px] top-[257px]" data-name="Button">
      <Container73 />
    </div>
  );
}

function Nav1() {
  return (
    <div className="h-[297px] relative shrink-0 w-full" data-name="Nav">
      <div className="-translate-x-1/2 absolute flex items-center justify-center left-1/2 size-[38px] top-px" style={{ "--transform-inner-width": "1183", "--transform-inner-height": "21" } as React.CSSProperties}>
        <div className="flex-none scale-x-95 scale-y-95">
          <ButtonActiveProjectIndicator />
        </div>
      </div>
      <Button6 />
      <Button7 />
      <Button8 />
      <Margin10 />
      <Button9 />
    </div>
  );
}

function Ab6AXuBq1FjRfakJ54XcS0O1NkR0S5M4FbBlPgDgPvp2DoP4BsHjNx3UuaBRoo2JP3ZiwCzHq3GdH7QrGzq5V5Y7UidAJtcq7CCETZk9EHiBv0W7Ia2UgpQwxncjytuW3ArzBs4ALvHSenTfhM2WtlXtajUn4UNBjPsZ3Cgzo0Rlrzc4NmXhN83C33J4PbfZu8FsZ3T5LeI3XYwnQCwMdpnSfA5Y4ZIHtgurUwZe1Bb5O96GugxYYjfBWoC7Ts8G8XAhqVwRrcg() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="AB6AXuBQ1FJRfakJ54xc_s0O1NkR0_s5m4-FBBlPG_DgPvp2doP4BsHjNx3UuaBRoo2jP3Ziw_CzHQ3gdH7QrGZQ5V5Y7uidAJtcq7-cC_eTZk9eHiBv0W7ia2ugpQwxncjytuW3arzBS4aLvHSenTfhM2wtlXTAJUn4uNBjPsZ3Cgzo0rlrzc4nmXhN83C33J4PbfZU8FsZ3t5leI3xYwnQCwMDPNSf_A5y4zIHtgurUWZe1BB5o96GugxYYjfBWoC7ts8G8XAhqVwRrcg">
      <div className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgAb6AXuBq1FjRfakJ54XcS0O1NkR0S5M4FbBlPgDgPvp2DoP4BsHjNx3UuaBRoo2JP3ZiwCzHq3GdH7QrGzq5V5Y7UidAJtcq7CCETZk9EHiBv0W7Ia2UgpQwxncjytuW3ArzBs4ALvHSenTfhM2WtlXtajUn4UNBjPsZ3Cgzo0Rlrzc4NmXhN83C33J4PbfZu8FsZ3T5LeI3XYwnQCwMdpnSfA5Y4ZIHtgurUwZe1Bb5O96GugxYYjfBWoC7Ts8G8XAhqVwRrcg} />
      </div>
    </div>
  );
}

function BackgroundBorder1() {
  return (
    <div className="bg-[#292a2d] relative rounded-[12px] shrink-0 size-[32px]" data-name="Background+Border">
      <div className="content-stretch flex flex-col items-start justify-center overflow-clip p-px relative rounded-[inherit] size-full">
        <Ab6AXuBq1FjRfakJ54XcS0O1NkR0S5M4FbBlPgDgPvp2DoP4BsHjNx3UuaBRoo2JP3ZiwCzHq3GdH7QrGzq5V5Y7UidAJtcq7CCETZk9EHiBv0W7Ia2UgpQwxncjytuW3ArzBs4ALvHSenTfhM2WtlXtajUn4UNBjPsZ3Cgzo0Rlrzc4NmXhN83C33J4PbfZu8FsZ3T5LeI3XYwnQCwMdpnSfA5Y4ZIHtgurUwZe1Bb5O96GugxYYjfBWoC7Ts8G8XAhqVwRrcg />
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(64,71,82,0.2)] border-solid inset-0 pointer-events-none rounded-[12px]" />
    </div>
  );
}

function Container74() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <BackgroundBorder1 />
    </div>
  );
}

function Margin11() {
  return (
    <div className="flex-[1_0_0] min-h-[32px] min-w-px relative" data-name="Margin">
      <div className="flex flex-col justify-end min-h-[inherit] size-full">
        <div className="content-stretch flex flex-col h-full items-start justify-end min-h-[inherit] pt-[601px] relative">
          <Container74 />
        </div>
      </div>
    </div>
  );
}

function AsideRailSidebarFarLeft() {
  return (
    <div className="absolute bg-[#0d0e11] content-stretch flex flex-col gap-px h-[1024px] items-center left-0 py-[16px] top-0 w-[64px]" data-name="Aside - RAIL SIDEBAR (Far Left)">
      <Margin9 />
      <Nav1 />
      <Margin11 />
    </div>
  );
}

function Container77() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 9.33333">
        <g id="Container">
          <path d={svgPaths.p3cc66d00} fill="var(--fill-0, #002B4F)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container76() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Container">
      <Container77 />
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[17px] justify-center leading-[0] not-italic relative shrink-0 text-[#002b4f] text-[11px] w-[136.23px]">
        <p className="leading-[16.5px]">MAIN-KERNEL: RUNNING</p>
      </div>
    </div>
  );
}

function Container79() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[12.833px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.8333 9.33333">
        <g id="Container">
          <path d={svgPaths.p1cc18300} fill="var(--fill-0, #002B4F)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container78() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Container">
      <Container79 />
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[17px] justify-center leading-[0] not-italic relative shrink-0 text-[#002b4f] text-[11px] w-[45.41px]">
        <p className="leading-[16.5px]">SYNCED</p>
      </div>
    </div>
  );
}

function Container75() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Container">
      <Container76 />
      <Container78 />
    </div>
  );
}

function Container81() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#002b4f] text-[10px] w-[30.02px]">
        <p className="leading-[15px]">UTF-8</p>
      </div>
    </div>
  );
}

function Container82() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['ABeeZee:Regular',sans-serif] h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#002b4f] text-[10px] w-[78.02px]">
        <p className="leading-[15px]">PYTHON 3.11.4</p>
      </div>
    </div>
  );
}

function Background1() {
  return (
    <div className="bg-[#002b4f] content-stretch flex flex-col items-start px-[8px] relative rounded-[2px] shrink-0" data-name="Background">
      <div className="flex flex-col font-['Liberation_Mono:Bold',sans-serif] h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#3294f0] text-[10px] w-[36.02px]">
        <p className="leading-[15px]">V1.0.4</p>
      </div>
    </div>
  );
}

function Container80() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Container">
      <Container81 />
      <Container82 />
      <Background1 />
    </div>
  );
}

function StatusBarFooter() {
  return (
    <div className="absolute bg-[#3294f0] bottom-0 content-stretch flex h-[28px] items-center justify-between left-0 px-[12px] right-0" data-name="STATUS BAR (Footer)">
      <Container75 />
      <Container80 />
    </div>
  );
}

export default function ProjectExecutionWorkMode() {
  return (
    <div className="bg-[#121316] relative size-full" data-name="Project Execution - Work Mode">
      <MainMainWorkspaceContent />
      <HeaderTopNavbar />
      <AsideExpandedSidebarProjectTabs />
      <AsideRailSidebarFarLeft />
      <StatusBarFooter />
    </div>
  );
}