import React, { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Pencil, Trash2, Download } from "lucide-react";

interface WhiteboardProps {
  participantId: number;
  socket: WebSocket | null;
}

export default function Whiteboard({ participantId, socket }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#3b82f6");
  const [lineWidth, setLineWidth] = useState(2);
  const [mode, setMode] = useState<"pencil" | "eraser">("pencil");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        // Save current content
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) tempCtx.drawImage(canvas, 0, 0);

        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        // Restore content
        ctx.drawImage(tempCanvas, 0, 0);
      }
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Handle incoming whiteboard data
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "whiteboard-data") {
          const { action, x, y, prevX, prevY, color, width, mode } = message.data;
          
          if (action === "draw") {
            drawOnCanvas(prevX, prevY, x, y, color, width, mode);
          } else if (action === "clear") {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      } catch (e) {
        console.error("Error handling whiteboard message", e);
      }
    };

    if (socket) {
      socket.addEventListener("message", handleMessage);
    }

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (socket) {
        socket.removeEventListener("message", handleMessage);
      }
    };
  }, [socket]);

  const drawOnCanvas = (
    prevX: number,
    prevY: number,
    x: number,
    y: number,
    color: string,
    width: number,
    drawMode: "pencil" | "eraser"
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.globalCompositeOperation = drawMode === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getMousePos(e);
    lastPos.current = pos;
  };

  const lastPos = useRef({ x: 0, y: 0 });

  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    const currentPos = getMousePos(e);
    const prevPos = lastPos.current;

    drawOnCanvas(prevPos.x, prevPos.y, currentPos.x, currentPos.y, color, lineWidth, mode);

    // Send data to others
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "whiteboard-data",
        participantId,
        data: {
          action: "draw",
          x: currentPos.x,
          y: currentPos.y,
          prevX: prevPos.x,
          prevY: prevPos.y,
          color,
          width: lineWidth,
          mode,
        },
      }));
    }

    lastPos.current = currentPos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "whiteboard-data",
        participantId,
        data: { action: "clear" },
      }));
    }
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <Button
            variant={mode === "pencil" ? "default" : "ghost"}
            size="icon"
            onClick={() => setMode("pencil")}
            className="w-8 h-8"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant={mode === "eraser" ? "default" : "ghost"}
            size="icon"
            onClick={() => setMode("eraser")}
            className="w-8 h-8"
          >
            <Eraser className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-slate-300 mx-1" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
          />
          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="text-xs border border-slate-300 rounded px-1 py-1 bg-white"
          >
            {[1, 2, 3, 4, 5, 8, 10, 15].map(w => (
              <option key={w} value={w}>{w}px</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadCanvas}
            className="w-8 h-8"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearCanvas}
            className="w-8 h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
            title="Clear All"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative cursor-crosshair touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}
