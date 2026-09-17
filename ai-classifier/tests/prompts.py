"""Hand-written prompts used only by the tests."""

# Prompts written for the tests only - none of them appear in app/data/training.jsonl
# (test_model.py checks this).
UNSEEN_PROMPTS: dict[str, list[str]] = {
    "conversation": [
        "hi there, what's up?",
        "I'm so stressed about exams, can you talk me through it?",
        "What's your favourite season of the year?",
    ],
    "writing": [
        "Write a short story about a robot who learns to bake bread",
        "Draft an email to my team announcing the office will be closed on Friday",
        "Help me write a toast for my best friend's retirement party",
    ],
    "coding": [
        "How do I sort a dictionary by value in Python?",
        "Write a JavaScript function that removes duplicates from an array",
        "My Java program throws ArrayIndexOutOfBoundsException, how do I fix it?",
    ],
    "image_generation": [
        "Generate an image of a snowy mountain village at dusk",
        "Create a digital painting of a whale flying over a city",
        "Make a photorealistic picture of a red vintage car on a coastal road",
    ],
    "summarization": [
        "Summarize this blog post in two sentences",
        "Give me a TL;DR of this meeting transcript",
        "Condense this 10-page report into the key takeaways",
    ],
    "translation": [
        "Translate 'good night and sweet dreams' into German",
        "Translate this paragraph into Italian",
        "What does 'buenos dias' mean in English?",
    ],
    "research": [
        "What are the causes of the decline of honeybee populations?",
        "How does the human immune system fight infections?",
        "What were the main consequences of the Industrial Revolution?",
    ],
}
