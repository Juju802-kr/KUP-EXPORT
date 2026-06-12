import { NextResponse } from "next/server";

function dataUrl(file: File, base64: string) {
  return `data:${file.type || "application/octet-stream"};base64,${base64}`;
}

function parseJson(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");
    return JSON.parse(match[0]);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PI OCR을 사용하려면 OPENAI_API_KEY 환경변수가 필요합니다." },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "읽을 PI 파일을 선택해주세요." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_OCR_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "첨부된 PI에서 오더 정보를 추출해 JSON만 반환해줘. orders 배열의 각 항목은 exportCountry, buyer, piNo, productionRequestNo, productName, unitPrice, quantity 키를 가져야 해. 값이 없으면 빈 문자열로 둬."
            },
            {
              type: "input_file",
              filename: file.name,
              file_data: dataUrl(file, bytes.toString("base64"))
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: `PI OCR 요청 실패: ${errorText.slice(0, 300)}` }, { status: 500 });
  }

  const result = await response.json();
  const text =
    result.output_text ??
    result.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? []).map((item: { text?: string }) => item.text ?? "").join("\n") ??
    "";
  const parsed = parseJson(text);
  return NextResponse.json({ orders: Array.isArray(parsed.orders) ? parsed.orders : [] });
}
