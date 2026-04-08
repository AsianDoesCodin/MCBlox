package com.mcblox.mod.mixin;

import com.mcblox.mod.McBloxModClient;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameMenuScreen.class)
public class GameMenuScreenMixin {

    @Inject(method = "initWidgets", at = @At("TAIL"))
    private void mcblox_replaceDisconnect(CallbackInfo ci) {
        if (McBloxModClient.config == null) return;

        GameMenuScreen screen = (GameMenuScreen) (Object) this;

        screen.children().stream()
            .filter(e -> e instanceof ButtonWidget)
            .map(e -> (ButtonWidget) e)
            .filter(btn -> {
                String text = btn.getMessage().getString();
                return text.contains("Disconnect") || text.contains("Save and Quit");
            })
            .findFirst()
            .ifPresent(oldBtn -> {
                screen.remove(oldBtn);
                screen.addDrawableChild(ButtonWidget.builder(
                    Text.literal("Exit Game"),
                    btn -> MinecraftClient.getInstance().scheduleStop()
                ).dimensions(oldBtn.getX(), oldBtn.getY(), oldBtn.getWidth(), oldBtn.getHeight()).build());
            });
    }
}
