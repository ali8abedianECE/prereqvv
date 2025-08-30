import { useEffect, useMemo, useRef } from "react";
import { Professor } from "../lib/types";

type Props = {
    data: Professor[];
    onHover: (p: Professor|null) => void;
    onClick: (p: Professor|null) => void;
    xMetric?: "Average Rating"|"Difficulty"|"Would Take Again %"|"Number of Ratings";
    yMetric?: "Average Rating"|"Difficulty"|"Would Take Again %"|"Number of Ratings";
};

function val(p:Professor, m:Props["xMetric"]) {
    switch (m) {
        case "Average Rating": return p.avgRating;
        case "Difficulty": return p.avgDifficulty;
        case "Would Take Again %": return p.wouldTakeAgainPercent;
        case "Number of Ratings": return p.numRatings;
        default: return 0;
    }
}

export default function ScatterPlot({ data, onHover, onClick, xMetric="Difficulty", yMetric="Average Rating" }: Props) {
    const ref = useRef<HTMLCanvasElement|null>(null);
    const M = 40;

    const ranges = useMemo(()=>{
        const xs = data.map(p=>val(p,xMetric)); const ys = data.map(p=>val(p,yMetric));
        const xr:[number,number] = [Math.min(...xs,0), Math.max(...xs,5)];
        const yr:[number,number] = [Math.min(...ys,0), Math.max(...ys,5)];
        return { xr, yr };
    },[data,xMetric,yMetric]);

    useEffect(()=>{
        const c = ref.current; if (!c) return;
        const ctx = c.getContext("2d"); if (!ctx) return;
        const w = c.clientWidth, h = c.clientHeight;
        c.width = w*devicePixelRatio; c.height = h*devicePixelRatio;
        ctx.scale(devicePixelRatio, devicePixelRatio);
        ctx.clearRect(0,0,w,h);

        ctx.strokeStyle="#003145"; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(M,h-M); ctx.lineTo(w-M,h-M); ctx.moveTo(M,h-M); ctx.lineTo(M,M); ctx.stroke();

        ctx.fillStyle="#111827"; ctx.font="12px system-ui";
        ctx.fillText(xMetric, w/2-40, h-10);
        ctx.save(); ctx.translate(14,h/2); ctx.rotate(-Math.PI/2); ctx.fillText(yMetric,-40,0); ctx.restore();

        const [x0,x1]=ranges.xr, [y0,y1]=ranges.yr;
        const sx=(x:number)=> M+(x-x0)/(x1-x0||1)*(w-2*M);
        const sy=(y:number)=> h-M-(y-y0)/(y1-y0||1)*(h-2*M);

        for (const p of data) {
            const x = sx(val(p,xMetric)), y = sy(val(p,yMetric));
            const r = Math.max(0, Math.min(p.avgRating,5))/5;
            let red:number, green:number;
            if (r <= .5) { const t=r/.5; red=255; green=.8*255*t; }
            else { const t=(r-.5)/.5; red=255*(1-t); green=.8*255*(1-t)+255*t; }
            ctx.fillStyle = `rgb(${red|0},${green|0},0)`;
            ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
        }

        const handle=(ev:MouseEvent, click=false)=>{
            const rect=c.getBoundingClientRect(); const mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
            let best:Professor|null=null, bestD=12;
            for (const p of data) {
                const x=sx(val(p,xMetric)), y=sy(val(p,yMetric));
                const d=Math.hypot(mx-x,my-y); if (d<bestD){bestD=d; best=p;}
            }
            click ? onClick(best) : onHover(best);
        };

        const onMove=(e:MouseEvent)=>handle(e,false);
        const onClk=(e:MouseEvent)=>handle(e,true);
        c.addEventListener("mousemove", onMove);
        c.addEventListener("click", onClk);
        return ()=>{ c.removeEventListener("mousemove", onMove); c.removeEventListener("click", onClk); };
    },[data,ranges,xMetric,yMetric,onHover,onClick]);

    return <canvas ref={ref} style={{ width:"100%", height:"calc(100vh - 24px)", border:"1px solid #e2e8f0", borderRadius:8 }} />;
}
