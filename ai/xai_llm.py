import json
from gradio_client import Client

# https://huggingface.co/spaces/xoaun/neonavi-xai/blob/main/app.py

HF_SPACE_URL = "xoaun/neonavi-xai"

def generate_xai_reasons(profile: dict, mode: str, route_axes: dict) -> list:
    """
    허깅페이스 스페이스(Qwen LLM) API를 호출하여 
    사용자 맞춤형 추천 이유를 받아옵니다.
    """
    try:
        print("🤖 LLM API 호출 중... 잠시만 기다려주세요!")
        
        # 1. 스페이스 API 클라이언트 연결
        client = Client(HF_SPACE_URL)
        
        # 2. 데이터 전송 (app.py에 정의된 순서대로 3개의 입력값을 보냅니다)
        # 딕셔너리 형태의 데이터는 파이썬 str()을 씌워서 문자열로 넘겨야 에러가 안 납니다.
        result_text = client.predict(
            profile=str(profile),
            mode=mode,
            route_data=str(route_axes),
            api_name="/predict"
        )
        
        # 3. LLM이 뱉어낸 JSON 문자열을 파이썬 딕셔너리로 파싱
        # (만약 여기서 파싱 에러가 나면 아래 except 블록으로 빠집니다)
        parsed_json = json.loads(result_text)
        
        print("✅ LLM 분석 완료!")
        # 프론트엔드에서 쓸 "recommend_reasons" 배열만 반환
        return parsed_json.get("recommend_reasons", [])
        
    except Exception as e:
        print(f"❌ LLM 통신 또는 파싱 에러: {e}")
        # 프론트엔드가 멈추지 않도록, 실패했을 때는 가짜(Fallback) 에러 데이터를 리턴
        return [
            {
                "icon": "⚠️", 
                "title": "AI 분석 지연", 
                "desc": "현재 AI 서버와의 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요."
            }
        ]