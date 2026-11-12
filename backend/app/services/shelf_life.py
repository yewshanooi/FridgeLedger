from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping


PANTRY_CATEGORIES = {
    "fresh",
    "dairy",
    "pantry",
    "frozen",
    "beverage",
    "household",
    "snack",
    "other",
}


@dataclass(frozen=True)
class ShelfLifeRule:
    category: str
    shelf_life_days: int | None
    keywords: tuple[str, ...]
    high_confidence: bool = True


_RULES: tuple[ShelfLifeRule, ...] = (
    # Ready-to-eat meals and cooked food.
    ShelfLifeRule(
        "fresh",
        2,
        (
            "cooked",
            "ready meal",
            "meal box",
            "bento",
            "lunch box",
            "rice bowl",
            "beef rice",
            "chicken rice",
            "fried rice",
            "potato beef rice",
            "nasi lemak",
            "nasi goreng",
            "mee goreng",
            "盖饭",
            "炒饭",
            "饭盒",
            "便当",
            "熟食",
            "煎蛋",
            "米饭",
        ),
    ),
    # Raw chilled proteins.
    ShelfLifeRule(
        "fresh",
        1,
        ("fish", "seafood", "shrimp", "prawn", "salmon", "tuna", "虾", "鱼", "海鲜"),
    ),
    ShelfLifeRule(
        "fresh",
        2,
        (
            "raw beef",
            "minced beef",
            "steak",
            "raw chicken",
            "chicken breast",
            "pork",
            "lamb",
            "sausage",
            "bacon",
            "牛肉",
            "鸡肉",
            "猪肉",
            "羊肉",
        ),
    ),
    ShelfLifeRule("fresh", 21, ("egg", "eggs", "鸡蛋", "蛋")),
    ShelfLifeRule("fresh", 5, ("tofu", "bean curd", "豆腐")),
    # Dairy.
    ShelfLifeRule("dairy", 7, ("milk", "fresh milk", "牛奶", "鲜奶")),
    ShelfLifeRule("dairy", 14, ("yogurt", "yoghurt", "酸奶")),
    ShelfLifeRule("dairy", 21, ("cheese", "butter", "cream cheese", "芝士", "奶酪", "黄油")),
    # Produce.
    ShelfLifeRule(
        "fresh",
        4,
        ("leafy", "lettuce", "spinach", "salad", "kangkung", "青菜", "生菜", "菠菜", "沙拉菜"),
    ),
    ShelfLifeRule(
        "fresh",
        5,
        ("berry", "berries", "strawberry", "blueberry", "banana", "香蕉", "草莓", "蓝莓"),
    ),
    ShelfLifeRule(
        "fresh",
        7,
        (
            "vegetable",
            "veggie",
            "greens",
            "tomato",
            "cucumber",
            "carrot",
            "broccoli",
            "fruit",
            "orange",
            "grape",
            "蔬菜",
            "番茄",
            "黄瓜",
            "胡萝卜",
            "西兰花",
            "水果",
            "橙",
            "葡萄",
        ),
    ),
    ShelfLifeRule("fresh", 21, ("apple", "potato", "onion", "苹果", "土豆", "马铃薯", "洋葱")),
    # Bread and bakery.
    ShelfLifeRule("pantry", 5, ("bread", "bun", "cake", "pastry", "croissant", "面包", "蛋糕")),
    # Frozen food.
    ShelfLifeRule(
        "frozen",
        90,
        ("frozen", "ice cream", "frozen dumpling", "冷冻", "冰冻", "冰淇淋", "冻饺"),
    ),
    # Pantry staples.
    ShelfLifeRule(
        "pantry",
        180,
        ("rice", "noodle", "pasta", "flour", "cereal", "oat", "米", "面", "粉", "麦片"),
        high_confidence=False,
    ),
    ShelfLifeRule(
        "pantry",
        365,
        ("canned", "can ", "tin ", "sauce", "oil", "vinegar", "jam", "罐头", "酱", "油", "醋"),
    ),
    # Snacks and beverages.
    ShelfLifeRule(
        "snack",
        90,
        ("chips", "cracker", "biscuit", "cookie", "chocolate", "snack", "薯片", "饼干", "巧克力", "零食"),
    ),
    ShelfLifeRule(
        "beverage",
        180,
        ("juice", "tea", "coffee", "soda", "water", "drink", "果汁", "茶", "咖啡", "汽水", "饮料"),
    ),
    # Non-food items should not drive expiry reminders.
    ShelfLifeRule(
        "household",
        None,
        ("detergent", "tissue", "paper towel", "soap", "shampoo", "洗衣", "纸巾", "肥皂", "洗发"),
    ),
)


_CATEGORY_DEFAULTS: dict[str, int | None] = {
    "fresh": 7,
    "dairy": 10,
    "pantry": 180,
    "frozen": 90,
    "beverage": 180,
    "household": None,
    "snack": 90,
    "other": 14,
}


def normalize_food_name(name: str | None) -> str | None:
    if not name:
        return None

    normalized = name.lower()
    normalized = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized or None


def enrich_receipt(extracted: Mapping[str, Any]) -> dict[str, Any]:
    receipt = dict(extracted)
    receipt["items"] = enrich_items(receipt.get("items", []))
    return receipt


def enrich_items(items: Iterable[Any]) -> list[dict[str, Any]]:
    return [_enrich_item(_to_dict(item)) for item in items]


def _to_dict(item: Any) -> dict[str, Any]:
    if hasattr(item, "model_dump"):
        return dict(item.model_dump())
    if hasattr(item, "dict"):
        return dict(item.dict())
    return dict(item)


def _enrich_item(item: dict[str, Any]) -> dict[str, Any]:
    name = item.get("name")
    normalized_name = normalize_food_name(item.get("normalized_name") or name)
    if normalized_name:
        item["normalized_name"] = normalized_name

    rule = _match_rule(normalized_name or "")
    category = _valid_category(item.get("category"))
    shelf_life_days = _valid_shelf_life(item.get("shelf_life_days"))

    if rule:
        if category is None or category == "other" or rule.high_confidence:
            category = rule.category
        if shelf_life_days is None or rule.high_confidence:
            shelf_life_days = rule.shelf_life_days

    if category is None:
        category = "other"

    if shelf_life_days is None:
        shelf_life_days = _CATEGORY_DEFAULTS[category]

    item["category"] = category
    item["shelf_life_days"] = shelf_life_days
    return item


def _match_rule(normalized_name: str) -> ShelfLifeRule | None:
    searchable = f" {normalized_name} "
    for rule in _RULES:
        if any(_keyword_matches(searchable, keyword) for keyword in rule.keywords):
            return rule
    return None


def _keyword_matches(searchable: str, keyword: str) -> bool:
    normalized_keyword = normalize_food_name(keyword)
    if not normalized_keyword:
        return False
    if re.fullmatch(r"[0-9a-z ]+", normalized_keyword):
        return re.search(
            rf"(?<![0-9a-z]){re.escape(normalized_keyword)}(?![0-9a-z])",
            searchable,
        ) is not None
    return normalized_keyword in searchable


def _valid_category(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    category = value.strip().lower()
    return category if category in PANTRY_CATEGORIES else None


def _valid_shelf_life(value: Any) -> int | None:
    if value is None:
        return None
    try:
        shelf_life_days = int(value)
    except (TypeError, ValueError):
        return None
    return shelf_life_days if shelf_life_days >= 0 else None
