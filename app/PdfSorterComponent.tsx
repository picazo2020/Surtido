"use client";
import { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
// 🎯 Cambiamos a la versión legacy para máxima compatibilidad local
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export default function PdfSorterComponent() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("ready");
  const [fileCount, setFileCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [isDragActive, setIsDragActive] = useState(false); 

  // 🔍 AQUÍ ESTÁ EL USEEFFECT CONFIGURADO LOCALMENTE:
  useEffect(() => {
    if (typeof window !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
    }
  }, []);

  const resetStatus = () => {
    setStatus("ready");
    setFileCount(0);
    setUploadProgress(0);
    setLoading(false);
  };

  const processFilesLocally = async (filesList: File[]) => {
    if (!filesList || filesList.length === 0) return;

    setFileCount(filesList.length);
    setLoading(true);
    setStatus("processing");
    setUploadProgress(10);

    try {
      // 1. Guardaremos las referencias estructuradas de origen para no duplicar dueños
      const allPairsGlobal: Array<{ sku: string; originalPdf: any; pageIndices: number[] }> = [];
//      const skuRegex = /(\d{3,4})[-]*(?:T\s*T\s*R|T\s*R\s*R|T\s*M\s*D|T\s*G\s*M)\s*\d*|(?!\b\d*2026\b)\b(\d{3,4})\s+[1-9]\b(?!\s*Order\s*ID)/i;
      // 🎯 REGEX UNIVERSAL: Captura marcas con guiones/saltos (Grupo 1) o aísla SKUs de calzado/sueltos limpios (Grupo 2) evitando las fechas
      // 🎯 REGEX MAESTRA CORREGIDA: Atrapa marcas prioritariamente con guiones/números (Opción A) o calzado/sueltos con cantidad aislada (Opción B)
      const skuRegex = /(\d{3,4})[-]*(?:T\s*T\s*R|T\s*R\s*R|T\s*M\s*D|T\s*G\s*M)\s*\d*|(?!\b\d*2026\b)\b(\d{3,4})\s+[1-9]\b(?!\s*Order\s*ID)/i;




      for (let b = 0; b < filesList.length; b++) {
        const file = filesList[b];
        console.log("\n=======================================================");
        console.log(`📂 PROCESANDO ARCHIVO [${b + 1}/${filesList.length}]: ${file.name}`);
        console.log("=======================================================");
        const arrayBuffer = await file.arrayBuffer();
        
        const originalPdf = await PDFDocument.load(arrayBuffer);
        const totalPages = originalPdf.getPageCount();

        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdfTextDoc = await loadingTask.promise;

        setUploadProgress(Math.round(10 + ((b / filesList.length) * 70)));

        for (let i = 0; i < totalPages; i += 2) {
          const p1 = i;
          const p2 = i + 1;
          
          if (p2 >= totalPages) break; 

          const pageTextDoc = await pdfTextDoc.getPage(p2 + 1); 
          const textContent = await pageTextDoc.getTextContent();
          const textToSearch = textContent.items.map((item: any) => item.str).join(" ");

          const match = textToSearch.match(skuRegex);
let skuPrefix = "9999";
if (match) {
  // ✅ match[1] captura si viene con marcas de ropa, match[2] captura si viene el número suelto/calzado
  skuPrefix = match[1] || match[2] || "9999"; 
}

          console.log(`[${file.name}] -> Pedido ${Math.floor(i/2) + 1}: SKU -> ${skuPrefix}`);

          const validIndices = [p1, p2].filter(idx => idx < totalPages);

          // Guardamos el documento de origen y los números de página exactos de la guía
          allPairsGlobal.push({
            sku: skuPrefix,
            originalPdf: originalPdf,
            pageIndices: validIndices
          });
        }
      }

      setUploadProgress(85);

      // 2. Creamos el diccionario para agrupar las guías por cada SKU único
      const skusGroups: { [key: string]: Array<{ doc: any; indices: number[] }> } = {};

      for (const pair of allPairsGlobal) {
        if (!skusGroups[pair.sku]) {
          skusGroups[pair.sku] = [];
        }
        skusGroups[pair.sku].push({
          doc: pair.originalPdf,
          indices: pair.pageIndices
        });
      }

      setUploadProgress(90);
      const uniqueSkus = Object.keys(skusGroups);
      console.log(`\n✨ Se detectaron ${uniqueSkus.length} grupos de SKUs únicos.`);

      // 3. Compilamos los PDFs en la memoria y los guardamos dentro de un ZIP
      console.log(`\n📦 Empaquetando ${uniqueSkus.length} grupos en un archivo ZIP de seguridad...`);
      
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const sku of uniqueSkus) {
        const skuPdf = await PDFDocument.create();
        
        for (const item of skusGroups[sku]) {
          const copiedPages = await skuPdf.copyPages(item.doc, item.indices);
          copiedPages.forEach(page => skuPdf.addPage(page));
        }
        
        const skuPdfBytes = await skuPdf.save();
        
        // Guardamos el binario directamente en la memoria del ZIP sin disparar descargas individuales
        zip.file(`GUIAS_SKU_${sku}.pdf`, new Uint8Array(skuPdfBytes));
        console.log(`✅ Agregado al contenedor: GUIAS_SKU_${sku}.pdf`);
      }

      // Generamos el archivo ZIP final y forzamos una única descarga masiva limpia
      const zipContent = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(zipContent);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LOTE_GUIAS_COMPRIMIDAS.zip`; 
      a.click();
      window.URL.revokeObjectURL(url);
      
      console.log(`\n🎉 ¡Descarga masiva completada con éxito! Se guardó LOTE_GUIAS_COMPRIMIDAS.zip`);

      
      setUploadProgress(100);
      setStatus("success");
    } catch (err) {
      console.error("Error procesando localmente:", err);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };


  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = Array.from(e.dataTransfer.files).filter(file => file.type === "application/pdf" || file.name.endsWith(".pdf"));
      if (validFiles.length > 0) processFilesLocally(validFiles);
      else setStatus("error");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFilesLocally(Array.from(e.target.files));
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] flex flex-col items-center py-12 px-4 font-sans w-full">
      <div className="max-w-2xl w-full mb-8 text-center">
        <div className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-widest">
          TIKTOK SHOP - MULTIPLES ARCHIVOS POR SKU (LOCAL)
        </div>
        <h1 className="text-4xl font-black text-red-900 mb-2 tracking-tight">
          J&T <span className="text-red-600">EXPRESS</span>
        </h1>
        <p className="text-slate-500 font-medium">
          Sistema masivo multiorigen por SKU agrupados con Drag & Drop
        </p>
      </div>

      <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl shadow-blue-100/50 overflow-hidden border border-slate-100">
        <div className="p-10">
          <div 
            onDragEnter={status === "ready" ? handleDrag : undefined}
            onDragOver={status === "ready" ? handleDrag : undefined}
            onDragLeave={status === "ready" ? handleDrag : undefined}
            onDrop={status === "ready" ? handleDrop : undefined}
            className={`relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center min-h-[300px] ${
              isDragActive ? "border-blue-500 bg-blue-50 scale-[1.02]" :
              status === "processing" ? "border-blue-400 bg-blue-50/20" : 
              status === "success" ? "border-green-400 bg-green-50/50" :
              status === "error" ? "border-red-400 bg-red-50/50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
            }`}
          >
            <div className="mb-6 transform transition-transform duration-500 hover:scale-110">
              {status === "ready" && <div className="text-6xl text-slate-300">{isDragActive ? "📥" : "📤"}</div>}
              {status === "processing" && <div className="text-6xl animate-bounce">⚙️</div>}
              {status === "success" && <div className="text-6xl drop-shadow-md">🎉</div>}
              {status === "error" && <div className="text-6xl">⚠️</div>}
            </div>

            <div className="text-center w-full">
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                {status === "ready" && (isDragActive ? "¡Suelta los archivos aquí!" : "Cargar guías PDF")}
                {status === "processing" && `Procesando lote localmente...`}
                {status === "success" && "¡Proceso Completado!"}
                {status === "error" && "Error de procesamiento"}
              </h3>
              
              <div className="text-sm text-slate-500 mb-6 max-w-[320px] mx-auto">
                {status === "ready" && "Arrastra tus PDFs directamente aquí o haz clic en el botón."}
                {status === "processing" && (
                  <div className="w-full mt-2">
                    <p className="font-semibold text-blue-700 mb-2">Analizando {fileCount} archivos: {uploadProgress}%</p>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                {status === "success" && "Todos los PDFs se unificaron y ordenaron sin límites de tamaño."}
                {status === "error" && "Hubo un error al procesar los archivos. Asegúrate de que no tengan restricciones."}
              </div>

              {status === "ready" ? (
                <label className="cursor-pointer inline-flex items-center justify-center px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                  <span>Seleccionar Archivos</span>
                  <input type="file" accept=".pdf" multiple className="hidden" onChange={handleFileInput} />
                </label>
              ) : status === "success" ? (
                <button 
                  onClick={resetStatus}
                  className="inline-flex items-center justify-center px-8 py-3 bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:bg-slate-900 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                >
                  🔄 Procesar otro lote
                </button>
              ) : status === "error" ? (
                <button 
                  onClick={resetStatus}
                  className="inline-flex items-center justify-center px-8 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                >
                  ⚠️ Reintentar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
