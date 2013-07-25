# Introducing Emmet LiveStyle

Emmet LiveStyle is plugin for live bi-directional (editor↔browser) CSS editing of new generation. Currently, it works in Google Chrome, Safari and Sublime Text, more browsers and editors will be available later.

This video demonstrates the most powerful features of LiveStyle.

<iframe width="570" height="428" src="//www.youtube.com/embed/iQLhGbkupS4?rel=0" frameborder="0" allowfullscreen="allowfullscreen"></iframe>

I guess you just saw a lot of new and interesting features: Facebook and Google live editing (hmm, why you should ever need this?), iOS web apps, multi-view and multi-device updates, even experiment with live bi-directional SCSS editing. But to better understand why I made this plugin and how it works, let’s take a look at current state of live edit tools.

## A state of live editing tools

Tools for refreshing web-browser view while you edit CSS in your editor aren’t new: people use them for years already. [LiveReload](http://livereload.com), [CodeKit](http://incident57.com/codekit/), [Grunt tasks](https://github.com/gruntjs/grunt-contrib-livereload) to name a few. The mechanism behind these tools is pretty simple: watch for CSS files update in special folder and update web-browser accordingly. So users have to edit CSS file and *save it* to see the changes. Not actually “live” update, but this simplicity has it’s own benefits: you can use these tools together with *preprocessors* so your web-page get updated automatically whenever you save your LESS or SASS file.

About a year ago, a new breed of live editing tools appeared. Editors like [Brackets](http://brackets.io) and [WebStorm](http://www.jetbrains.com/webstorm/) are tightly integrated with web-browser (more specifically, with Google Chrome) and allow you to see updates instantly, e.g. without saving a file. They send updated file content to the browser every time you change something. But in order to use live edit, they require a special built-in web-server to be used to properly map your local files with browser URLs.

Getting changes from DevTools back into your CSS file is a bit harder. There are few tools like [Tin.cr](http://tin.cr) that allows you to save your DevTools changes back to file, and Chrome Dev team introduced [Chrome Workspaces](https://www.youtube.com/watch?v=kVSo4buDAEE) recently for the very same purpose.

Summing-up together, to use these tools for truly live development (deliver updates from editor to browser and vice versa), you have to:

* Use the same CSS files in your text editor and web-browser
* Keep your files in local file system
* In some cases, use special tooling web-server

All these tools works fine when you just started your project development, until…

What happens when your web-site goes into production? What if you concatenate and minify your CSS code for better performance and UX? Most of these tools become pretty much useless:

* You can’t use tooling web-server because you need to use your own one for backend/CMS.
* You can’t get DevTools changes back into file since (concatenated and minified) CSS in browser is not the same your source one.
* In some large projects, you can’t use local file system: your files might be in your private sandbox of dev server.

So, you don’t have much options now, right?

To solve these issues, I’ve created LiveStyle. Unlike other tools, it neither works with files directly, nor replaces them in browser or editor. It *maps changes* from one source into another.

## How LiveStyle works

Imagine you‘re editing CSS file and I’ve asked you “What you just changed?”.

You could answer something like “On line 2, replaced characters from 12 to 16 with word `red`”, but I’m pretty sure your answer will be *“In `body` selector, changed `background` property value to `red`”*. In other words, instead of describing how bytes were changed in text file, you would describe how *structure of CSS file was changed*.

But the thing is: if you pass the very same info—“in `body`, change `background` value to `red`”–to another developer, he can perform the very same changes in *his own* CSS file and get the very same result!

This is exactly how LiveStyle works. Whenever you update CSS source, it performs structural comparison with the previous state and creates a special patch that describes how CSS structure was changed. This patch then transmitted to all clients and applied to associated CSS source.

This approach gives you the following benefits:

* You can associate two completely different CSS sources for live edit. E.g. you can take minified and concatenated CSS source in browser, associate it with one of the source CSS modules opened in editor and use them for fully bi-directional live edit. 
* You don’t need to keep you files in local file system: open it directly from FTP, your fancy network mount or whatever. If file can be opened by text editor, use can use it for live edit.
* You can even create new, untitled file and use it for live edit right away!
* You don’t need a special web-server, code snippet or file watcher, everything works in editor and browser.

This is why I used Facebook main page in the video above to demonstrate the power of LiveStyle. There’s no doubt it’s one of the largest and complex web-sites on the planet and I don’t have access to either Facebook server or its CSS source. But I need just a few clicks to start live CSS edit. Image how easily you can do the very same for your own web-site.

## LiveStyle features

* Instant updates: see changes as-you-type. No file saving, no page reloading.
* No local files required.
* Cross-platform
* Multi-view and multi-device updates. You can open the same page in different windows and get instant updates in all windows. If your monitor large enough, you can easily tweak responsive design as never before! And yes, changes made in DevTools of one window will be automatically applied to other ones.
* You can even live edit different web-sites, for example, desktop and mobile versions of you web-site that shares the same CSS code base.
* Extremely easy setup: just open CSS file in editor and associate it with browser one in LiveStyle browser pane. No complex mappings, patterns etc.

## Will it work with SASS/SCSS/LESS?

Although I’ve demonstrated live SCSS edit in video above, it’s just an experiment and I don’t know  if it will be possible to create a solid solution.

It’s pretty easy to resolve SCSS nesting to plain CSS since it’s one-to-one mapping mostly. But when it comes to dynamic features like mixins, math, variables etc., things getting much harder. Of course I can do some basic transforms to create patch for CSS from preprocessor, but it’s very hard to transform CSS changes back to preprocessor.

But I’m not saying it’s impossible. If LiveStyle gets enough attention and funding, I’ll do a research on how to make it possible.


## Does it scales?

Like original Emmet, LiveStyle is written entirely in JavaScript and works in every modern JS environment. But it requires additional support from editor side.

Basically, they should provide `on change` callback to detect text buffer changes and network connectivity. Unfortunately, not every editor supports these features.


## Is it free?

No, LiveStyle will be a paid product, but it’s free during public beta test.

## How to use LiveStyle?

Go to [Emmet LiveStyle: Installation and usage](/install.html)
