## 卡通描边文字样式工具。对应旧版 client/ui/textStyle.ts。
##
## Label 上加 8 向黑描边：在 Godot 里没有 CSS text-shadow，用 Label 的
## outline_size + outline_color 实现（等价效果）。
## 用法：Style.apply_plain(label) / Style.apply_bold(label, 20)
class_name Style
extends RefCounted

const OUTLINE_COLOR := Color(0, 0, 0, 1)
const OUTLINE_1PX := 3        # 8 向 1px 描边视觉厚度（Godot outline_size 是像素数）
const OUTLINE_2PX := 5        # 加粗版

const FONT_COLOR := Color(1, 1, 1)
const FONT_COLOR_GOLD := Color(1, 0.85, 0.35)
const FONT_COLOR_SILVER := Color(0.8, 0.85, 1)
const FONT_COLOR_RED := Color(1, 0.3, 0.3)
const FONT_COLOR_GREEN := Color(0.55, 0.9, 0.5)
const FONT_COLOR_SHIELD := Color(0.55, 0.8, 1)

const RARITY_COLOR := {
	"common": Color(0.8, 0.8, 0.8),
	"uncommon": Color(0.5, 0.9, 0.5),
	"rare": Color(0.5, 0.7, 1.0),
	"legendary": Color(1.0, 0.7, 0.2),
}


static func apply_plain(lbl: Label, size: int = 15) -> void:
	lbl.add_theme_font_size_override("font_size", size)
	lbl.add_theme_color_override("font_color", FONT_COLOR)
	lbl.add_theme_color_override("font_outline_color", OUTLINE_COLOR)
	lbl.add_theme_constant_override("outline_size", OUTLINE_1PX)


static func apply_bold(lbl: Label, size: int = 22) -> void:
	lbl.add_theme_font_size_override("font_size", size)
	lbl.add_theme_color_override("font_color", FONT_COLOR)
	lbl.add_theme_color_override("font_outline_color", OUTLINE_COLOR)
	lbl.add_theme_constant_override("outline_size", OUTLINE_2PX)


static func apply_colored(lbl: Label, color: Color, size: int = 15, bold: bool = false) -> void:
	lbl.add_theme_font_size_override("font_size", size)
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_outline_color", OUTLINE_COLOR)
	lbl.add_theme_constant_override("outline_size", OUTLINE_2PX if bold else OUTLINE_1PX)


static func rarity_color(r: String) -> Color:
	return RARITY_COLOR.get(r, FONT_COLOR)
