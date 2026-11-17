QUESTIONS = []
def Q(category, topic, style, difficulty, stem, options, explanation, code=None):
    QUESTIONS.append(dict(category=category, topic=topic, style=style, difficulty=difficulty,
                          stem=stem, options=options, explanation=explanation, code=code))
