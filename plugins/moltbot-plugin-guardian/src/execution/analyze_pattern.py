
import sys
import json
import re

def analyze_pattern(data):
    """
    Analyze input text for suspicious patterns using Python's regex engine.
    This runs INSIDE the sandbox, so it can handle complex/heavy regex without freezing the Node.js event loop.
    """
    text = data.get('text', '')
    
    # Example heuristic rules
    risk_score = 0.0
    matches = []

    # 1. SQL Injection Heuristics
    if re.search(r"(\%27)|(\')|(\-\-)|(\%23)|(#)", text, re.IGNORECASE):
        # weak signal
        pass
        
    if re.search(r"((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))", text, re.IGNORECASE):
        risk_score += 0.4
        matches.append('sqli_basic')

    if re.search(r"\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))", text, re.IGNORECASE):
        risk_score += 0.6
        matches.append('sqli_or_clause')

    # 2. Command Injection
    if re.search(r"(;|\||`|\$|\()", text):
         if re.search(r"(wget|curl|bash|sh|rm|cat|etc\/passwd)", text, re.IGNORECASE):
            risk_score += 0.9
            matches.append('cmd_injection_critical')

    # 3. Path Traversal
    if re.search(r"(\.\.(\/|\\))", text):
        risk_score += 0.5
        matches.append('path_traversal')

    return {
        "risk_score": min(risk_score, 1.0),
        "matches": matches,
        "is_suspicious": risk_score > 0.5
    }

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_str = sys.stdin.read()
        if not input_str:
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
            
        data = json.loads(input_str)
        result = analyze_pattern(data)
        
        # Print result to stdout
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
