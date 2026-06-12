/**
 * GSAP 动画管理器
 * 负责 UI 和特效动画，与 Three.js 动画系统共存
 */
import gsap from 'gsap';

export class GSAPAnimationManager {
  private animations: Map<string, gsap.core.Tween> = new Map();
  private timelines: Map<string, gsap.core.Timeline> = new Map();
  /**
   * show/hide 类动画的「上一次目标可见状态」。
   * updateHUD 每帧无条件调用这些函数，靠它去抖：仅在可见状态翻转时才真正建 tween，
   * 否则直接 return —— 避免每帧用时间戳 id 狂建无法 cancel 的并发 tween。
   */
  private showStates: Map<string, boolean> = new Map();

  /**
   * 动画健康条变化
   */
  animateHealthBar(element: HTMLElement, newHealthPercent: number): void {
    const animationId = `health-bar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 取消之前的动画（如果有相同元素的动画）
    this.cancelAnimation(animationId);

    const tween = gsap.to(element, {
      width: `${newHealthPercent}%`,
      duration: 0.3,
      ease: "power2.out",
      onComplete: () => this.animations.delete(animationId)
    });

    this.animations.set(animationId, tween);
  }

  /**
   * 显示伤害数字动画
   */
  showDamageNumber(element: HTMLElement, options: {
    text: string;
    color: string;
    x: number;
    y: number;
    fontSize: number;
    isCrit: boolean;
    damage: number;
  }): void {
    // 按池元素稳定 id（dataset.animId）keying：环形池复用同一元素时先 kill 上一个 tween，
    // 与 showFloatText 共用同一命名空间，避免伤害数字与补偿文字争同一 DOM 的 transform。
    const animationId = `floattext-${element.dataset.animId ?? '0'}`;
    this.cancelAnimation(animationId);

    // 设置初始位置和样式
    element.textContent = options.text;
    element.style.color = options.color;
    element.style.left = `${options.x}px`;
    element.style.top = `${options.y}px`;
    element.style.fontSize = `${options.fontSize}px`;
    element.style.opacity = '1';
    element.style.display = 'block';
    element.style.transform = 'translateY(0px) scale(1)';

    // 根据是否为暴击调整动画参数
    const flyDistance = options.isCrit ? -60 : (options.damage > 20 ? -50 : -40);
    const endScale = options.isCrit ? 0.6 : 0.8;

    const timeline = gsap.timeline({
      onComplete: () => {
        element.style.display = 'none';
        this.timelines.delete(animationId);
      }
    });

    timeline
      .to(element, {
        y: flyDistance,
        duration: 0.5,
        ease: "power2.out"
      })
      .to(element, {
        opacity: 0,
        scale: endScale,
        duration: 0.3
      }, "-=0.2");

    this.timelines.set(animationId, timeline);
  }

  /**
   * 浮动文字动画（升级空池补偿的银币/金币飘字）。
   * 与 showDamageNumber 共用 damage-number 环形池 + 同一 `floattext-<animId>` 命名空间，
   * 由 GSAP 单一管理同一元素，取代旧的 CSS transition（避免双轨争 transform）。
   */
  showFloatText(element: HTMLElement, options: {
    text: string;
    color: string;
    x: number;
    y: number;
    fontSize: number;
    textShadow?: string;
  }): void {
    const animationId = `floattext-${element.dataset.animId ?? '0'}`;
    this.cancelAnimation(animationId);

    element.textContent = options.text;
    element.style.color = options.color;
    element.style.left = `${options.x}px`;
    element.style.top = `${options.y}px`;
    element.style.fontSize = `${options.fontSize}px`;
    element.style.fontWeight = 'bold';
    if (options.textShadow) element.style.textShadow = options.textShadow;
    element.style.opacity = '1';
    element.style.display = 'block';
    gsap.set(element, { y: 0, scale: 1.1 });

    const timeline = gsap.timeline({
      onComplete: () => {
        element.style.display = 'none';
        this.timelines.delete(animationId);
      }
    });

    timeline.to(element, {
      y: -70,
      scale: 0.85,
      opacity: 0,
      duration: 0.7,
      ease: "power2.out"
    });

    this.timelines.set(animationId, timeline);
  }

  /**
   * 升级标签脉冲动画
   */
  playLevelLabelPulse(element: HTMLElement): gsap.core.Timeline {
    const animationId = 'level-label-pulse';
    this.cancelAnimation(animationId);

    // 等级标签现在用 flex(inset:0) 居中，不再需要 translateX(-50%) 偏移，
    // 因此脉冲只做 scale + 颜色，避免标签水平跳位。
    const timeline = gsap.timeline({ repeat: -1 });

    timeline
      .to(element, {
        scale: 1.2,
        color: '#ffff88',
        textShadow: '0 0 16px rgba(255,220,80,0.9),0 0 32px rgba(255,180,40,0.5)',
        duration: 0.3,
        ease: "sine.inOut"
      })
      .to(element, {
        scale: 1.0,
        color: '#ffffff',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
        duration: 0.3,
        ease: "sine.inOut"
      });

    this.timelines.set(animationId, timeline);
    return timeline;
  }

  /**
   * Boss 血条动画
   */
  animateBossHealthBar(element: HTMLElement, newHealthPercent: number): void {
    const animationId = `boss-health-bar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.cancelAnimation(animationId);

    const tween = gsap.to(element, {
      width: `${newHealthPercent}%`,
      duration: 0.2,
      ease: "power2.out",
      onComplete: () => this.animations.delete(animationId)
    });

    this.animations.set(animationId, tween);
  }

  /**
   * UI 元素淡入淡出动画
   */
  fadeInElement(element: HTMLElement, duration: number = 0.3): void {
    const animationId = `fade-in-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.cancelAnimation(animationId);

    const tween = gsap.to(element, {
      opacity: 1,
      display: 'block',
      duration: duration,
      ease: "power2.out",
      onComplete: () => this.animations.delete(animationId)
    });

    this.animations.set(animationId, tween);
  }

  /**
   * UI 元素淡出动画
   */
  fadeOutElement(element: HTMLElement, duration: number = 0.3): void {
    const animationId = `fade-out-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.cancelAnimation(animationId);

    const tween = gsap.to(element, {
      opacity: 0,
      duration: duration,
      ease: "power2.in",
      onComplete: () => {
        element.style.display = 'none';
        this.animations.delete(animationId);
      }
    });

    this.animations.set(animationId, tween);
  }

  /**
   * 传送门指示器动画
   */
  animateTeleporterIndicator(element: HTMLElement, show: boolean, duration: number = 0.3): void {
    const animationId = 'teleporter';
    if (this.showStates.get(animationId) === show) return;
    this.showStates.set(animationId, show);
    this.cancelAnimation(animationId);

    if (show) {
      const tween = gsap.to(element, {
        opacity: 1,
        display: 'block',
        duration: duration,
        ease: "power2.out",
        onComplete: () => this.animations.delete(animationId)
      });
      this.animations.set(animationId, tween);
    } else {
      const tween = gsap.to(element, {
        opacity: 0,
        duration: duration,
        ease: "power2.in",
        onComplete: () => {
          element.style.display = 'none';
          this.animations.delete(animationId);
        }
      });
      this.animations.set(animationId, tween);
    }
  }

  /**
   * 超时横幅动画
   */
  animateOvertimeBanner(element: HTMLElement, show: boolean, duration: number = 0.4): void {
    const animationId = 'overtime';
    if (this.showStates.get(animationId) === show) return;
    this.showStates.set(animationId, show);
    this.cancelAnimation(animationId);

    if (show) {
      const tween = gsap.to(element, {
        opacity: 1,
        display: 'block',
        y: 0,
        duration: duration,
        ease: "back.out(1.2)",
        onComplete: () => this.animations.delete(animationId)
      });
      this.animations.set(animationId, tween);
    } else {
      const tween = gsap.to(element, {
        opacity: 0,
        y: -20,
        duration: duration,
        ease: "power2.in",
        onComplete: () => {
          element.style.display = 'none';
          this.animations.delete(animationId);
        }
      });
      this.animations.set(animationId, tween);
    }
  }

  /**
   * 组合标签动画
   */
  animateComboLabel(element: HTMLElement, show: boolean, duration: number = 0.3): void {
    const animationId = 'combo';
    if (this.showStates.get(animationId) === show) return;
    this.showStates.set(animationId, show);
    this.cancelAnimation(animationId);

    if (show) {
      const tween = gsap.to(element, {
        opacity: 1,
        display: 'block',
        scale: 1,
        duration: duration,
        ease: "power2.out",
        onComplete: () => this.animations.delete(animationId)
      });
      this.animations.set(animationId, tween);
    } else {
      const tween = gsap.to(element, {
        opacity: 0,
        scale: 0.8,
        duration: duration,
        ease: "power2.in",
        onComplete: () => {
          element.style.display = 'none';
          this.animations.delete(animationId);
        }
      });
      this.animations.set(animationId, tween);
    }
  }

  /**
   * 消耗品标签动画
   */
  animateConsumableLabel(element: HTMLElement, show: boolean, duration: number = 0.3): void {
    const animationId = 'consumable';
    if (this.showStates.get(animationId) === show) return;
    this.showStates.set(animationId, show);
    this.cancelAnimation(animationId);

    if (show) {
      const tween = gsap.to(element, {
        opacity: 1,
        display: 'flex',
        scale: 1,
        duration: duration,
        ease: "power2.out",
        onComplete: () => this.animations.delete(animationId)
      });
      this.animations.set(animationId, tween);
    } else {
      const tween = gsap.to(element, {
        opacity: 0,
        scale: 0.8,
        duration: duration,
        ease: "power2.in",
        onComplete: () => {
          element.style.display = 'none';
          this.animations.delete(animationId);
        }
      });
      this.animations.set(animationId, tween);
    }
  }

  /**
   * 交互按钮动画
   */
  animateInteractButton(element: HTMLElement, show: boolean, duration: number = 0.3): void {
    const animationId = 'interact';
    if (this.showStates.get(animationId) === show) return;
    this.showStates.set(animationId, show);
    this.cancelAnimation(animationId);

    if (show) {
      const tween = gsap.to(element, {
        opacity: 1,
        display: 'block',
        y: 0,
        duration: duration,
        ease: "back.out(1.2)",
        onComplete: () => this.animations.delete(animationId)
      });
      this.animations.set(animationId, tween);
    } else {
      const tween = gsap.to(element, {
        opacity: 0,
        y: 10,
        duration: duration,
        ease: "power2.in",
        onComplete: () => {
          element.style.display = 'none';
          this.animations.delete(animationId);
        }
      });
      this.animations.set(animationId, tween);
    }
  }

  /**
   * 最终蜂群边框动画
   */
  animateFinalSwarmBorder(element: HTMLElement, intensity: number, duration: number = 0.5): void {
    const animationId = 'final-swarm-border';
    this.cancelAnimation(animationId);

    const timeline = gsap.timeline({
      repeat: -1,
      yoyo: true
    });

    timeline.to(element, {
      borderColor: `rgba(255,50,50,${0.4 + intensity * 0.3})`,
      duration: duration,
      ease: "sine.inOut"
    });

    this.timelines.set(animationId, timeline);
  }

  /**
   * 最终蜂群标签动画
   */
  animateFinalSwarmLabel(element: HTMLElement, intensity: number, duration: number = 0.6): void {
    const animationId = 'final-swarm-label';
    this.cancelAnimation(animationId);

    const timeline = gsap.timeline({
      repeat: -1,
      yoyo: true
    });

    timeline.to(element, {
      opacity: 0.7 + intensity * 0.3,
      duration: duration,
      ease: "sine.inOut"
    });

    this.timelines.set(animationId, timeline);
  }

  /**
   * 停止最终蜂群动画
   */
  stopFinalSwarmAnimations(): void {
    this.cancelAnimation('final-swarm-border');
    this.cancelAnimation('final-swarm-label');
  }

  /**
   * 屏幕闪光动画
   */
  screenFlash(color: string, duration: number = 0.5): void {
    const animationId = 'screen-flash';
    this.cancelAnimation(animationId);

    // 创建闪光元素
    const flashEl = document.createElement('div');
    flashEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 150;
      background: ${color};
      opacity: 0.4;
    `;
    document.body.appendChild(flashEl);

    const timeline = gsap.timeline({
      onComplete: () => {
        flashEl.remove();
        this.timelines.delete(animationId);
      }
    });

    timeline
      .to(flashEl, {
        opacity: 0,
        duration: duration,
        ease: "power2.out"
      });

    this.timelines.set(animationId, timeline);
  }

  /**
   * 吐司通知动画
   */
  showToast(element: HTMLElement, duration: number = 1.2): void {
    const animationId = `toast-${Date.now()}`;
    this.cancelAnimation(animationId);

    const timeline = gsap.timeline({
      onComplete: () => {
        element.remove();
        this.timelines.delete(animationId);
      }
    });

    timeline
      .fromTo(element,
        { opacity: 0, scale: 0.8, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.2)" }
      )
      .to(element, {
        opacity: 0,
        scale: 0.95,
        y: -12,
        duration: 0.3,
        ease: "power2.in"
      }, `+=${duration - 0.6}`);

    this.timelines.set(animationId, timeline);
  }

  /**
   * 取消特定动画
   */
  cancelAnimation(id: string): void {
    const animation = this.animations.get(id);
    const timeline = this.timelines.get(id);

    if (animation) {
      animation.kill();
      this.animations.delete(id);
    }

    if (timeline) {
      timeline.kill();
      this.timelines.delete(id);
    }
  }

  /**
   * 清理所有动画
   */
  cleanup(): void {
    this.animations.forEach(animation => animation.kill());
    this.timelines.forEach(timeline => timeline.kill());
    this.animations.clear();
    this.timelines.clear();
    this.showStates.clear();
  }
}

// 导出单例实例
export const gsapAnimations = new GSAPAnimationManager();